"""피처 공개 시점 검사 파일의 실제 판정이 단계·전체 실행을 중단하는지 검증한다."""

import json
from pathlib import Path

import pytest
from crowdcast import paths
from crowdcast.pipeline import __main__ as cli
from crowdcast.pipeline import stages
from pipeline_fixtures import latest_record


# 피처 모듈이 정상 종료해도 검사 파일 누락·위반·빈 검사는 실패해야 한다.
@pytest.mark.parametrize(
    ("audit", "passed"),
    [
        (None, False),
        ({"checked": 12, "violations": 1, "asOfRule": "available_at <= as_of"}, False),
        ({"checked": 0, "violations": 0, "asOfRule": "available_at <= as_of"}, False),
        ({"checked": 12, "violations": 0, "asOfRule": "available_at <= as_of"}, True),
        ({"checked": True, "violations": 0, "asOfRule": "available_at <= as_of"}, False),
    ],
)
def test_availability_report_controls_stage(
    pipeline_root: Path, monkeypatch: pytest.MonkeyPatch, audit: dict | None, passed: bool
) -> None:
    path = paths.PROCESSED / "features_availability.json"
    if audit is None:
        path.unlink()
    else:
        path.write_text(json.dumps(audit))
    monkeypatch.setattr(stages, "missing_entrypoint", lambda stage: None)
    monkeypatch.setattr(stages, "command", lambda *args: (0, ""))
    assert cli.main(["--from", "features", "--to", "features"]) == (0 if passed else 1)
    stage = latest_record(pipeline_root)["stages"][2]
    assert stage["gate"]["passed"] is passed
    if passed:
        assert stage["artifacts"][0]["path"] == "data/processed/features_availability.json"
