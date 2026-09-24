"""후속 모듈이 들어왔을 때 백테스트 비교와 일괄 예보 경고가 정해진 경계를 지키는지 검증한다."""

import json
from pathlib import Path

import polars as pl
import pytest
from crowdcast import paths
from crowdcast.pipeline import gates, stages
from pipeline_fixtures import backtest


# MdAPE +3%p와 포함률 -0.05(비율)는 경계를 포함하며 초과 악화는 실패한다(0.8 → 0.1 같은 급락 포함).
@pytest.mark.parametrize(
    ("mdape", "coverage", "passed"),
    [(15.5, 0.75, True), (15.51, 0.75, False), (15.5, 0.7499, False), (12.5, 0.1, False)],
)
def test_backtest_thresholds(pipeline_root: Path, mdape: float, coverage: float, passed: bool) -> None:
    path = paths.REPORTS / "backtest/2025/backtest.json"
    path.parent.mkdir(parents=True)
    path.write_text(json.dumps(backtest(mdape, coverage)))
    assert gates.optional_gate("backtest", [path], backtest())["passed"] is passed
    assert gates.optional_gate("backtest", [path], None)["passed"] is True


# 예보 감소는 문서 기준대로 경고에 그치고 단계 실패로 승격하지 않는다.
@pytest.mark.parametrize(("count", "warning"), [(90, False), (89, True)])
def test_batch_warning(pipeline_root: Path, count: int, warning: bool) -> None:
    path = paths.PROCESSED / "upcoming.parquet"
    pl.DataFrame({"event_id": ["ev-연천구석기축제-2025"] * count}).write_parquet(path)
    gate = gates.optional_gate("batch", [path], 100)
    assert gate["passed"] is True
    assert ("경고" in gate["message"]) is warning


# 완료 포인터가 가리키지 않는 과거 버전 파일은 이번 학습의 산출물에 들어가지 않는다.
def test_train_artifacts_are_current_version_only(pipeline_root: Path) -> None:
    pointer = paths.REPORTS / "backtest/latest.json"
    pointer.parent.mkdir(parents=True, exist_ok=True)
    pointer.write_text(json.dumps({"modelVersion": "2026-09-25"}))
    for version in ("2026-09-24", "2026-09-25"):
        folder = paths.MODELS / version
        folder.mkdir()
        (folder / "p50.txt").write_text("학습된 모형")
    assert set(stages.output_files("train")) == {paths.MODELS / "2026-09-25/p50.txt"}


# 모듈이 성공 종료해도 필수 산출물이 전혀 없으면 통과가 아니다.
@pytest.mark.parametrize("stage", ["train", "backtest", "batch"])
def test_missing_outputs_fail(stage: str) -> None:
    assert gates.optional_gate(stage, [], None)["passed"] is False


# 같은 골든 ID를 출력해도 단위 일치 사례의 구간 재현에 실패하면 통과시키지 않는다.
@pytest.mark.parametrize(("verdict", "passed"), [("포함", True), ("벗어남", False)])
def test_golden_verdict(pipeline_root: Path, verdict: str, passed: bool) -> None:
    current = backtest()
    current["golden"] = [
        {
            "eventId": "e-yeongjong-2025",
            "name": "영종 불꽃축제",
            "hostExpected": None,
            "model": {"p10": 10000, "p50": 20000, "p90": 30000, "unit": "명", "timeUnit": "순간"},
            "actual": {
                "id": "q-yeongjong-actual",
                "name": "보도 실제 인원",
                "value": 20000,
                "p10": None,
                "p50": None,
                "p90": None,
                "unit": "명",
                "timeUnit": "순간",
                "spatialScope": "행사장",
                "valueKind": "사후집계",
                "estimated": False,
                "assumptionIds": [],
                "announcedAt": "2025-10-19",
            },
            "unitsComparable": True,
            "verdict": verdict,
        }
    ]
    path = paths.REPORTS / "backtest/2025/backtest.json"
    path.parent.mkdir(parents=True)
    path.write_text(json.dumps(current))
    assert gates.optional_gate("backtest", [path], None)["passed"] is passed
    assert gates.optional_gate("backtest", [path], current)["passed"] is passed


# 포인터가 가리키는 버전의 카드·분위수 모델 세 파일이 모두 맞아야 학습을 통과시킨다.
@pytest.mark.parametrize("broken", [None, "p10.txt", "version"])
def test_train_gate_requires_card_and_quantile_models(pipeline_root: Path, broken: str | None) -> None:
    pointer = paths.REPORTS / "backtest/latest.json"
    pointer.parent.mkdir(parents=True, exist_ok=True)
    fixture = paths.REPO_ROOT / "packages/contracts/fixtures/model-card/valid-v0-1-0.json"
    card = json.loads(fixture.read_bytes())
    version = card["modelVersion"] if broken != "version" else "다른-버전"
    pointer.write_text(json.dumps({"modelVersion": version}))
    directory = paths.MODELS / version
    directory.mkdir(parents=True)
    (directory / "model_card.json").write_text(json.dumps(card))
    (directory / "g0.json").write_text("{}")
    for name in ("p10.txt", "p50.txt", "p90.txt"):
        if name != broken:
            (directory / name).write_text("합성 분위수 모형")
    gate = gates.optional_gate("train", stages.output_files("train"), None)
    assert gate["passed"] is (broken is None)


# 일괄 예보의 dry 입력에는 사용 모델 포인터와 그 포인터가 가리키는 모델 카드가 들어간다.
def test_batch_inputs_require_pointer(pipeline_root: Path) -> None:
    pointer = paths.REPORTS / "backtest/promoted.json"
    assert pointer in stages.input_files("batch")
    pointer.parent.mkdir(parents=True, exist_ok=True)
    pointer.write_text(json.dumps({"modelVersion": "v1-test"}))
    assert paths.MODELS / "v1-test/model_card.json" in stages.input_files("batch")


# 골든이 0건이어도 사용 모델보다 성적이 나빠진 후보는 미검증이 아니라 실패다.
@pytest.mark.parametrize(("coverage", "passed"), [(0.8, None), (0.5, False)])
def test_unverified_backtest_still_checks_regression(
    pipeline_root: Path, coverage: float, passed: bool | None
) -> None:
    path = paths.REPORTS / "backtest/2025/backtest.json"
    path.parent.mkdir(parents=True)
    current = backtest(coverage=coverage)
    current["golden"] = []
    path.write_text(json.dumps(current))
    previous = {**backtest(), "golden": []}
    assert gates.optional_gate("backtest", [path], previous)["passed"] is passed


# 사용 모델에 있던 골든 사례가 후보에서 사라지면 미검증이 아니라 승격 금지다.
def test_lost_golden_blocks_promotion(pipeline_root: Path) -> None:
    path = paths.REPORTS / "backtest/2025/backtest.json"
    path.parent.mkdir(parents=True)
    current = backtest()
    current["golden"] = []
    path.write_text(json.dumps(current))
    gate = gates.optional_gate("backtest", [path], backtest())
    assert gate["passed"] is False and "골든 사례 소실" in gate["message"]
    first = gates.optional_gate("backtest", [path], None)
    assert first["passed"] is None and "최초 모델: 직전 비교 불가" in first["message"]


# 입력 자료에 골든 사례가 있으면(H8 확보) 결과가 0건이거나 일부가 빠져도 미검증이 아니라 승격 금지다.
def test_acquired_golden_must_appear_in_results(pipeline_root: Path) -> None:
    pl.DataFrame({"event_id": ["e-yeongjong-2025"], "is_golden": [True]}).write_parquet(
        paths.PROCESSED / "labels.parquet"
    )
    path = paths.REPORTS / "backtest/2025/backtest.json"
    path.parent.mkdir(parents=True)
    current = backtest()
    current["golden"] = []
    path.write_text(json.dumps(current))
    gate = gates.optional_gate("backtest", [path], None)
    assert gate["passed"] is False and "결과 누락 1건" in gate["message"]
