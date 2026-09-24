"""후속 모듈이 들어왔을 때 백테스트 비교와 일괄 예보 경고가 정해진 경계를 지키는지 검증한다."""

import json
from pathlib import Path

import polars as pl
import pytest
from crowdcast import paths
from crowdcast.pipeline import gates, stages


# 표시 지표는 백분율로 고정해 비율과 %p를 섞지 않는다.
def backtest(mdape: float = 12.5, coverage: float = 80) -> dict:
    return {
        "runId": "backtest-2025",
        "modelRunId": "mr-2025",
        "modelVersion": "2025",
        "target": "일평균 방문객",
        "evalYears": [2025],
        "metrics": {
            "mdape": mdape,
            "coverage80": coverage,
            "coverageN": 10,
            "judgmentRecall": None,
            "judgmentPrecision": None,
            "baselineDeltaPp": None,
            "comparablePairs": 10,
        },
        "points": [],
        "golden": [],
    }


# MdAPE +3%p와 포함률 -5%p는 경계를 포함하며 초과 악화는 실패한다.
@pytest.mark.parametrize(
    ("mdape", "coverage", "passed"), [(15.5, 75, True), (15.51, 75, False), (15.5, 74.99, False)]
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


# 모델 카드를 쓰지 않은 과거 버전 파일은 이번 학습의 산출물에 들어가지 않는다.
def test_train_artifacts_are_current_version_only(pipeline_root: Path) -> None:
    card = paths.MODELS / "model_card.json"
    card.write_text(json.dumps({"modelVersion": "2026-09-25"}))
    for version in ("2026-09-24", "2026-09-25"):
        folder = paths.MODELS / version
        folder.mkdir()
        (folder / "p50.txt").write_text("학습된 모형")
    assert set(stages.output_files("train")) == {card, paths.MODELS / "2026-09-25/p50.txt"}


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
