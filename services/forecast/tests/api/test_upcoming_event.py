"""선택 행사 API가 일괄 예보 입력 스냅샷만 반환하고 부재·불일치를 구분하는지 검증한다."""

import json

import polars as pl
import pytest
from crowdcast import paths
from fastapi.testclient import TestClient


# 요약과 입력을 같은 parquet 실행에 저장해 실제 조회 경계를 재현한다.
def save_input(event: dict, **changes: object) -> None:
    row = {
        **{key: event[key] for key in ("name", "type", "startsAt", "endsAt", "sigunguCode", "sigunguName")},
        "eventId": event["id"], "runId": "batch-yeongjong", "eventInput": json.dumps(event), **changes,
    }
    pl.DataFrame([row]).write_parquet(
        paths.PROCESSED / "upcoming.parquet", metadata={"runId": "batch-yeongjong"},
    )


# 현재 마스터가 달라져도 당시 입력의 선택 필드·출처까지 그대로 반환한다.
def test_exact_batch_event(client: TestClient, event: dict) -> None:
    save_input(event)
    pl.DataFrame([{"event_id": event["id"], "name": "변경된 행사"}]).write_parquet(
        paths.PROCESSED / "events.parquet",
    )
    result = client.get(f"/v1/festivals/upcoming/{event['id']}/event")
    assert result.status_code == 200, result.text
    assert result.json() == event
    assert client.get("/v1/festivals/upcoming/e-unknown/event").status_code == 404
    assert client.get("/v1/festivals/upcoming/invalid/event").status_code == 400


# 스냅샷 없는 구형 배치는 현재 자료로 추정하지 않고 재생성을 요청한다.
def test_legacy_batch_needs_snapshot(client: TestClient, event: dict) -> None:
    save_input(event)
    file = paths.PROCESSED / "upcoming.parquet"
    pl.read_parquet(file).drop("eventInput").write_parquet(file, metadata={"runId": "batch-yeongjong"})
    result = client.get(f"/v1/festivals/upcoming/{event['id']}/event")
    assert result.status_code == 503
    assert "다시 생성" in result.json()["detail"]


# 다른 실행·다른 행사·응답 계약 위반을 정상 행사로 발행하지 않는다.
@pytest.mark.parametrize("change", ["run", "id", "schema"])
def test_inconsistent_snapshot(client: TestClient, event: dict, change: str) -> None:
    altered = {**event}
    if change == "id":
        altered["id"] = "e-other-event"
    if change == "schema":
        altered["venue"] = None
    save_input(event, **{
        "run": {"runId": "batch-other"}, "id": {"eventInput": json.dumps(altered)},
        "schema": {"eventInput": json.dumps(altered)},
    }[change])
    assert client.get(f"/v1/festivals/upcoming/{event['id']}/event").status_code == 500
