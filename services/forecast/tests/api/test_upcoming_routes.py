"""다가오는 행사 API의 범위·정렬·계약 검사와 파일 부재 응답을 검증한다."""

import json
from pathlib import Path

import polars as pl
import pytest
from crowdcast import paths
from crowdcast.api.assemble.http import endpoint_validator
from fastapi.testclient import TestClient


# 저장 순서를 뒤섞어 등급·원 확률·시작일 우선순위와 한쪽 범위 생략을 함께 검사한다.
def test_upcoming_sort_and_filter(client: TestClient) -> None:
    template = json.loads(
        (paths.REPO_ROOT / "packages/contracts/fixtures/festival-summary/valid-card.json").read_text()
    )
    cases = [(1, 0.99, "2026-10-01"), (4, 0.5, "2026-11-30"), (4, 0.8, "2026-10-03"),
             (4, 0.8, "2026-09-29"), (4, 1.0, "2026-09-28"), (4, 1.0, "2026-12-01")]
    rows = [{**template, "eventId": f"e-jinju-{i}", "forecastId": f"f-jinju-{i}", "level": level,
             "pOver1000": probability, "startsAt": f"{day}T00:00:00+09:00",
             "modelVersion": "v0.1.0", "modelVerdict": "미검증", "baselineAvailable": False,
             "runId": "batch-jinju", "date_source": "TourAPI", "date_available_at": "2026-09-25"}
            for i, (level, probability, day) in enumerate(cases)]
    pl.DataFrame(rows).write_parquet(paths.PROCESSED / "upcoming.parquet", metadata={"runId": "batch-jinju"})
    response = client.get("/v1/festivals/upcoming?from=2026-09-29&to=2026-11-30")
    assert response.status_code == 200, response.text
    result = response.json()
    assert [row["eventId"] for row in result] == ["e-jinju-3", "e-jinju-2", "e-jinju-1", "e-jinju-0"]
    endpoint_validator("/v1/festivals/upcoming", "response").validate(result)
    assert "modelVerdict" not in result[0]
    assert "date_source" not in result[0] and "runId" not in result[0]
    assert response.headers["x-run-id"] == "batch-jinju"
    assert len(client.get("/v1/festivals/upcoming").json()) == 6
    assert len(client.get("/v1/festivals/upcoming?from=2026-11-30").json()) == 2
    assert len(client.get("/v1/festivals/upcoming?to=2026-09-29").json()) == 2
    empty = client.get("/v1/festivals/upcoming?from=2027-01-01")
    assert empty.json() == [] and empty.headers["x-run-id"] == "batch-jinju"


# 잘못된 달력 날짜·역전 범위는 자료 유무와 무관하게 입력 오류로 처리한다.
@pytest.mark.parametrize("query", ["from=2026-02-30", "to=garbage", "from=20261130",
                                    "from=2026-12-01&to=2026-09-29"])
def test_upcoming_invalid_dates(client: TestClient, query: str) -> None:
    assert client.get(f"/v1/festivals/upcoming?{query}").status_code == 400


# 배치가 한 번도 성공하지 않은 상태를 정상 빈 목록으로 숨기지 않는다.
def test_upcoming_missing_file(client: TestClient) -> None:
    assert client.get("/v1/festivals/upcoming").status_code == 503


# 파일에 잘못된 등급이 들어오면 최종 응답 계약 검증에서 차단한다.
def test_upcoming_response_contract(client: TestClient) -> None:
    row = json.loads(
        (paths.REPO_ROOT / "packages/contracts/fixtures/festival-summary/valid-card.json").read_text()
    )
    pl.DataFrame([{**row, "level": 5, "runId": "batch-jinju"}]).write_parquet(
        paths.PROCESSED / "upcoming.parquet", metadata={"runId": "batch-jinju"},
    )
    assert client.get("/v1/festivals/upcoming").status_code == 500


# 서로 다른 실행이나 결측 식별자가 섞인 요약은 일부 날짜만 조회하더라도 발행하지 않는다.
@pytest.mark.parametrize("run_ids", [["batch-jinju", "batch-seoul"], ["batch-jinju", None]])
def test_upcoming_inconsistent_run_ids(client: TestClient, run_ids: list[str | None]) -> None:
    row = json.loads(
        (paths.REPO_ROOT / "packages/contracts/fixtures/festival-summary/valid-card.json").read_text()
    )
    pl.DataFrame([{**row, "runId": run_id} for run_id in run_ids]).write_parquet(
        paths.PROCESSED / "upcoming.parquet", metadata={"runId": "batch-jinju"},
    )
    assert client.get("/v1/festivals/upcoming?from=2027-01-01").status_code == 500


# 조회 중 파일이 교체돼도 이미 읽은 본문과 같은 실행 식별자를 응답 헤더로 보낸다.
def test_upcoming_snapshot_header(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    row = json.loads(
        (paths.REPO_ROOT / "packages/contracts/fixtures/festival-summary/valid-card.json").read_text()
    )
    file = paths.PROCESSED / "upcoming.parquet"
    pl.DataFrame([{**row, "runId": "batch-jinju"}]).write_parquet(file, metadata={"runId": "batch-jinju"})
    read_bytes = Path.read_bytes

    # 디스크에는 다음 실행을 놓되 조회 함수에는 첫 실행의 스냅샷을 돌려준다.
    def replace_after_read(path: Path) -> bytes:
        content = read_bytes(path)
        if path == file:
            pl.DataFrame([{**row, "name": "진주남강유등축제", "runId": "batch-next"}]).write_parquet(
                file, metadata={"runId": "batch-next"},
            )
        return content

    monkeypatch.setattr(Path, "read_bytes", replace_after_read)
    response = client.get("/v1/festivals/upcoming")
    assert response.status_code == 200
    assert response.json() == [row]
    assert response.headers["x-run-id"] == "batch-jinju"


# 경계 파일의 공백·개행까지 원문 그대로 반환하고 출처·캐시 헤더를 유지한다.
def test_topojson_bytes_and_headers(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(paths, "EXTERNAL", tmp_path)
    folder = tmp_path / "boundaries"
    folder.mkdir()
    raw = b'{ "type": "Topology", "objects": {}, "arcs": [] }\n'
    (folder / "sigungu.topo.json").write_bytes(raw)
    response = client.get("/v1/regions/topojson")
    assert response.status_code == 200
    assert response.content == raw
    assert response.headers["cache-control"] == "public, max-age=86400"
    assert response.headers["x-attribution"] == "CC BY 4.0 admdongkor"
    assert response.headers["content-type"] == "application/json"
    (folder / "sigungu.topo.json").unlink()
    assert client.get("/v1/regions/topojson").status_code == 503
