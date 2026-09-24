"""피처 공개 시점 검사 파일의 실제 판정이 단계·전체 실행을 중단하는지 검증한다."""

from pathlib import Path

import pytest
from crowdcast import paths
from crowdcast.pipeline import __main__ as cli
from crowdcast.pipeline import stages
from pipeline_fixtures import latest_record, write_features


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

    # 검사 결과는 이번 명령 안에서 생성해 내용 판정과 갱신 검사를 함께 통과시킨다.
    def command(*args: object) -> tuple[int, str]:
        write_features(audit)
        if audit is None:
            path.unlink()
        return 0, ""

    # 파일을 생성한 시각과 관계없이 위반·빈 검사는 반드시 실패해야 한다.
    monkeypatch.setattr(stages, "missing_entrypoint", lambda stage: None)
    monkeypatch.setattr(stages, "command", command)
    assert cli.main(["--from", "features", "--to", "features"]) == (0 if passed else 1)
    stage = latest_record(pipeline_root)["stages"][2]
    assert stage["gate"]["passed"] is passed
    if passed:
        assert {row["path"] for row in stage["artifacts"]} == {
            "data/processed/features_availability.json",
            "data/processed/features.parquet",
        }
