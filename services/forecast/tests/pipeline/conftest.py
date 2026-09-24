"""파이프라인 테스트의 데이터·기록 경로를 임시 디렉터리에 격리하고 통신을 막는다."""

import json
from pathlib import Path

import httpx
import polars as pl
import pytest
from crowdcast import paths
from crowdcast.pipeline import __main__ as cli
from pipeline_fixtures import TODAY, audit, region_frame


# 전체 네트워크 전송을 막아 캐시 테스트가 실제 키와 장부를 소비할 수 없게 한다.
@pytest.fixture(autouse=True)
def offline(monkeypatch: pytest.MonkeyPatch) -> None:
    # 우회 요청도 즉시 실패시켜 0회 외부 호출 조건을 강제한다.
    def reject(*args: object, **kwargs: object) -> None:
        raise AssertionError("파이프라인 테스트의 네트워크 호출 금지")

    # 모든 테스트에서 공유 인증키를 사용하는 전송 계층을 차단한다.
    monkeypatch.setattr(httpx.HTTPTransport, "handle_request", reject)


# 공유 데이터 경로는 건드리지 않고 정상 fetch·labels 저장 입력을 준비한다.
@pytest.fixture
def pipeline_root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    for name, relative in (
        ("DATA", "data"),
        ("PROCESSED", "data/processed"),
        ("CACHE", "data/cache"),
        ("EXTERNAL", "data/external"),
        ("MODELS", "models"),
        ("REPORTS", "reports"),
    ):
        directory = tmp_path / relative
        directory.mkdir(parents=True, exist_ok=True)
        monkeypatch.setattr(paths, name, directory)
    monkeypatch.setattr(cli, "korea_today", lambda: TODAY)
    processed = paths.PROCESSED
    region_frame().write_parquet(processed / "region_daily.parquet")
    events = pl.DataFrame({"event_id": ["ev-연천구석기축제-2025"], "is_golden": [False]})
    events.write_parquet(processed / "events.parquet")
    events.write_parquet(processed / "labels.parquet")
    (processed / "labels_g0.json").write_text(json.dumps(audit((processed / "labels.parquet").read_bytes())))
    (processed / "diy_targets.csv").write_text("festival_name\n연천구석기축제\n")
    (processed / "mcst_festivals.parquet").write_bytes(b"offline test input")
    boundary = paths.EXTERNAL / "boundaries/sigungu.topo.json"
    boundary.parent.mkdir()
    boundary.write_text("{}")
    return tmp_path
