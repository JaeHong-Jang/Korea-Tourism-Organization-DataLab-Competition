"""운영 조회의 계약·시간순 상한·손상 기록 격리·절대 경로 비노출을 확인한다."""

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from crowdcast import paths
from crowdcast.api.assemble.http import endpoint_validator
from crowdcast.data.call_ledger import KST
from crowdcast.pipeline import run_record, stages
from fastapi.testclient import TestClient


# 실제 실행·캐시를 읽지 않도록 API 픽스처에서 빠진 공유 경로도 격리한다.
@pytest.fixture(autouse=True)
def ops_paths(api_data: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    for name, relative in (("DATA", "data"), ("REPORTS", "reports"), ("CACHE", "data/cache")):
        folder = api_data / relative
        folder.mkdir(parents=True, exist_ok=True)
        monkeypatch.setattr(paths, name, folder)


# 저장 폴더 순서·UTC 오프셋·mtime과 무관하게 실제 시작 시각으로 최신 유효 실행만 반환한다.
def test_runs_sorted_limited_and_corrupt_skipped(
    client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    records = []
    for index in range(55):
        record = run_record.new_record(stages.STAGES, ("fetch",), False)
        record["runId"] = f"run-{55 - index:03}"
        stamp = datetime(2026, 9, 25, tzinfo=UTC) + timedelta(minutes=index)
        record["startedAt"] = stamp.isoformat() if index % 2 else stamp.astimezone(KST).isoformat()
        run_record.write_record(record)
        records.append(record)
    corrupt = paths.REPORTS / "runs/broken"
    corrupt.mkdir()
    (corrupt / "run.json").write_bytes(b"{broken")
    invalid = paths.REPORTS / "runs/invalid"
    invalid.mkdir()
    (invalid / "run.json").write_text(json.dumps({"runId": "invalid"}))
    result = client.get("/v1/runs")
    assert result.status_code == 200
    endpoint_validator("/v1/runs", "response").validate(result.json())
    assert [row["runId"] for row in result.json()] == [row["runId"] for row in reversed(records[-50:])]
    assert "건너뜁니다" in caplog.text


# 문자열 속 절대 경로는 가리고 유효 상대 산출물·해시는 보존한다.
def test_runs_hide_paths_and_reject_unsafe_artifacts(client: TestClient, api_data: Path) -> None:
    record = run_record.new_record(stages.STAGES, ("fetch",), False)
    record["summary"] = f"오류: {paths.PROCESSED}/region_daily.parquet 및 /private/cache/input.json"
    record["stages"][0]["gate"]["message"] = r"파일 없음 C:\Users\operator\data.csv"
    record["stages"][0]["artifacts"] = [{"path": "data/processed/region_daily.parquet", "sha256": "a" * 64}]
    run_record.write_record(record)
    bad = {**record, "runId": "unsafe"}
    bad["stages"] = json.loads(json.dumps(record["stages"]))
    bad["stages"][0]["artifacts"][0]["path"] = "/private/cache/input.json"
    run_record.write_record(bad)
    result = client.get("/v1/runs")
    assert result.status_code == 200 and len(result.json()) == 1
    assert str(api_data) not in result.text and "/private/" not in result.text and "Users" not in result.text
    assert result.json()[0]["stages"][0]["artifacts"] == record["stages"][0]["artifacts"]


# 초기 설치도 빈 실행 목록과 여섯 자료의 null 상태를 정상 계약으로 반환한다.
def test_empty_ops_contracts(client: TestClient) -> None:
    assert client.get("/v1/runs").json() == []
    result = client.get("/v1/ops/freshness")
    assert result.status_code == 200
    endpoint_validator("/v1/ops/freshness", "response").validate(result.json())
    assert len(result.json()) == 6
    assert all(row["lastCollectedAt"] is None and row["rows"] is None for row in result.json())


# 배열 전체 검증을 생략하면 개별 항목의 계약 위반을 응답으로 흘리는 회귀를 잡는다.
def test_ops_response_array_is_validated(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    from crowdcast.api.routes import ops

    monkeypatch.setattr(ops, "freshness", lambda: [{"datasetId": "invalid"}])
    assert client.get("/v1/ops/freshness").status_code == 500
