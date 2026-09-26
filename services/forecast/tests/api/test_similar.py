"""유사 사례의 대표성·공개 시점·단위·근거와 검색 순서의 결정성을 검증한다."""

import json
from datetime import date
from pathlib import Path

import polars as pl
import pytest
from crowdcast import paths
from crowdcast.analytics.similar import case, reference_size
from crowdcast.api.assemble import inputs
from crowdcast.api.contract import validate
from fastapi.testclient import TestClient


# 골든·미공개·비대표 행사를 제거한 뒤 최대 다섯 건만 반환한다.
def test_similar_exclusions_and_evidence(client: TestClient, case_data: tuple, event: dict) -> None:
    response = client.post("/v1/similar", json=event)
    assert response.status_code == 200
    results = response.json()
    assert len(results) == 5
    assert {row["eventId"] for row in results} == {
        f"e-yeongjong-fireworks-{year}" for year in range(2020, 2025)
    }
    for row in results:
        validate("similar-event", row)
        assert row["announced"] is None
        assert row["unitsComparable"] is False
        quantity = row["measured"]
        assert (quantity["unit"], quantity["timeUnit"], quantity["spatialScope"]) == ("명/일", "일", "행사장")
        assert quantity["id"] in row["evidence"][0]["quantityIds"]
        assert row["evidenceId"] == row["evidence"][0]["id"]
        assert row["evidence"][0]["availableAt"] <= "2025-10-04"
        summary = json.loads(row["evidence"][0]["summary"])
        assert summary["similarity"] == row["similarity"]
        assert summary["comparison"] == f"유사도 {row['similarity']} — 유형 같음·규모대 같음·지역 같음"
    assert response.content == client.post("/v1/similar", json=event).content


# 금방 개최할 행사도 과거 공개일을 앞으로 당기지 않는다.
def test_d14_and_early_cutoff(event: dict, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(inputs, "today", lambda: date(2025, 10, 15))
    assert inputs.cutoff(event) == date(2025, 10, 4)
    monkeypatch.setattr(inputs, "today", lambda: date(2025, 9, 1))
    assert inputs.cutoff(event) == date(2025, 9, 1)
    event["startsAt"] = "2025-10-18T23:00:00Z"
    monkeypatch.setattr(inputs, "today", lambda: date(2025, 10, 18))
    assert inputs.cutoff(event) == date(2025, 10, 5)


# 자료 순서가 달라져도 내용 해시와 사례 정렬은 바뀌지 않는다.
def test_case_order_is_stable(client: TestClient, case_data: tuple, event: dict) -> None:
    before = client.post("/v1/similar", json=event).content
    events, labels = case_data
    pl.DataFrame(events[::-1]).write_parquet(paths.PROCESSED / "events.parquet")
    pl.DataFrame(labels[::-1]).write_parquet(paths.PROCESSED / "labels.parquet")
    assert before == client.post("/v1/similar", json=event).content


# 단위 정의가 하나라도 다르면 수치가 같아도 비교 가능으로 표시하지 않는다.
@pytest.mark.parametrize(
    "field,value",
    [
        ("unit", "명"),
        ("timeUnit", "기간누적"),
        ("spatialScope", "시군구"),
        ("valueKind", "사전예상"),
    ],
)
def test_quantity_metadata_controls_comparison(case_data: tuple, field: str, value: str) -> None:
    events, labels = case_data
    prior = dict(events[-1])
    measured = case(prior, labels[-1], {"유형": True, "규모대": True, "지역": True}, date(2025, 10, 4))[
        "measured"
    ]
    prior["announced"] = {**measured, "id": "q-yeongjong-announced", "name": "주최측 발표"}
    comparable = case(prior, labels[-1], {"유형": True, "규모대": True, "지역": True}, date(2025, 10, 4))
    assert comparable["unitsComparable"] is True
    assert comparable["evidence"][1]["source"]["datasetId"] == "ds-mcst-festival-plans"
    prior["announced"][field] = value
    assert (
        case(prior, labels[-1], {"유형": True, "규모대": True, "지역": True}, date(2025, 10, 4))[
            "unitsComparable"
        ]
        is False
    )


# 새 발표일을 모르는 값은 예전 행사라는 이유로 공개된 것으로 취급하지 않는다.
def test_unknown_announcement_date(case_data: tuple) -> None:
    events, labels = case_data
    prior = dict(events[-1])
    measured = case(prior, labels[-1], {"유형": True, "규모대": True, "지역": True}, date(2025, 10, 4))[
        "measured"
    ]
    prior["announced"] = {**measured, "announcedAt": None}
    assert (
        case(prior, labels[-1], {"유형": True, "규모대": True, "지역": True}, date(2025, 10, 4))["announced"]
        is None
    )


# 실버는 실측으로 위장하지 않고 시군구 순증 추정을 명시한다.
def test_silver_estimated(case_data: tuple) -> None:
    events, labels = case_data
    label = {**labels[-1], "label_tier": "silver", "spatial_scope": "시군구"}
    result = case(events[-1], label, {"유형": True, "규모대": True, "지역": True}, date(2025, 10, 4))
    assert result["measured"]["estimated"] is True
    assert result["evidence"][0]["source"]["datasetId"] == "ds-kto-visitors-15101972"


# 무효 일정과 알 수 없는 필드는 호출부 오류로 돌려준다.
@pytest.mark.parametrize(
    "change",
    [{"startsAt": "2025-11-01T19:00:00+09:00"}, {"budgetKrw": -1}, {"id": "잘못된식별자"}, {"extra": 1}],
)
def test_invalid_event(client: TestClient, event: dict, change: dict) -> None:
    assert client.post("/v1/similar", json={**event, **change}).status_code == 400


# 검색 자료가 존재하되 공개된 라벨이 없으면 빈 배열이 정직한 결과다.
def test_no_published_labels(client: TestClient, case_data: tuple, event: dict) -> None:
    labels = pl.read_parquet(paths.PROCESSED / "labels.parquet")
    labels.with_columns(pl.lit(date(2026, 1, 1)).alias("available_at")).write_parquet(
        paths.PROCESSED / "labels.parquet",
    )
    response = client.post("/v1/similar", json=event)
    assert response.status_code == 200
    assert response.json() == []


# 영역 일치가 확인되지 않은 DIY 골드는 계약 밖 단위로 비교하지 않는다.
def test_unconfirmed_gold_b_is_excluded(client: TestClient, case_data: tuple, event: dict) -> None:
    events, labels = case_data
    labels[-1].update(label_tier="goldB", spatial_scope="지정영역")
    pl.DataFrame(labels).write_parquet(paths.PROCESSED / "labels.parquet")
    response = client.post("/v1/similar", json=event)
    assert response.status_code == 200
    assert events[-1]["event_id"] not in {row["eventId"] for row in response.json()}


# 시군구 순증 실버를 전회차 행사장 규모 실측으로 검색에 쓰지 않는다.
def test_silver_is_not_reference_size(case_data: tuple, event: dict) -> None:
    events, labels = case_data
    labels = [{**row, "label_tier": "silver", "spatial_scope": "시군구"} for row in labels]
    assert reference_size(event, date(2025, 10, 4), {row["event_id"]: row for row in events}, labels) is None


# 지역 불일치나 규모를 알 수 없는 경우에도 점수와 비교 문장을 일치시킨다.
@pytest.mark.parametrize("unknown_size", [False, True])
def test_similarity_comparison_summary(
    client: TestClient, case_data: tuple, event: dict, unknown_size: bool
) -> None:
    event["sigunguCode"] = "11110"
    if not unknown_size:
        event["expectedByHost"] = {
            **case(case_data[0][-1], case_data[1][-1], {"유형": True}, date(2025, 10, 4))["measured"],
            "valueKind": "사전예상",
        }
    response = client.post("/v1/similar", json=event)
    assert response.status_code == 200, response.text
    for row in response.json():
        summary = json.loads(row["evidence"][0]["summary"])
        assert summary["similarity"] == row["similarity"] == (0.5 if unknown_size else 2 / 3)
        size_text = "확인 불가" if unknown_size else "같음"
        assert summary["comparison"] == f"유사도 {row['similarity']} — 유형 같음·규모대 {size_text}·지역 다름"


# 실버(시군구 순증)는 행사장 방문객과 정의가 달라 규모대를 "확인 불가"로 두고 점수에서 뺀다.
def test_silver_size_is_not_compared(client: TestClient, forecast_data: Path, event: dict) -> None:
    labels = pl.read_parquet(paths.PROCESSED / "labels.parquet").with_columns(
        pl.lit("silver").alias("label_tier"), pl.lit("시군구").alias("spatial_scope")
    )
    labels.write_parquet(paths.PROCESSED / "labels.parquet")
    for row in client.post("/v1/similar", json=event).json():
        summary = json.loads(row["evidence"][0]["summary"])
        assert "규모대 확인 불가" in summary["comparison"]
