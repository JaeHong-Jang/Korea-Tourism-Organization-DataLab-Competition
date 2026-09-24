"""합성 일별 방문자에 부호·날짜·지역 연결 오류를 넣어 실제 실버 게이트 중단을 검증한다."""

from typing import Any

import polars as pl
import pytest
from crowdcast.labels.merge import merge_labels
from crowdcast.labels.silver import build_silver
from crowdcast.labels.silver_qc import enforce_silver_gate, silver_metrics
from crowdcast.labels.silver_signal import signal_retention
from silver_fixtures import signal_inputs


# 실버 산식부터 병합·QC까지 실제 경로로 집계해 검사 결과를 직접 만들어 넣지 않는다.
def metrics(events: list[dict[str, Any]], frame: pl.DataFrame) -> dict[str, Any]:
    diagnostics = []
    rows, excluded = build_silver(events, frame, "합성_region_daily.parquet", diagnostics=diagnostics)
    assert not excluded
    return silver_metrics(diagnostics, merge_labels(rows, set()))


# ① 부호 뒤집기는 유의 음수, 날짜·지역 연결 오류는 ③ 연도별 비율 감소로 중단해야 한다.
@pytest.mark.parametrize(
    "fault,gate",
    [("sign", "significant_negative"), ("baseline_week", "signal_retention"), ("region", "signal_retention")],
)
def test_injected_observation_errors(fault: str, gate: str) -> None:
    events, frame = signal_inputs()
    correct = metrics(events, frame)
    correct["signal_retention"] = signal_retention(correct, None, "a" * 64)
    enforce_silver_gate(correct)
    assert correct["candidate_count"] == correct["significant_count"] == 40
    previous = {"schema_version": 2, "snapshot_sha256": "a" * 64, "silver": correct}
    event_day = (pl.col("date").dt.month() == 7) & (pl.col("date").dt.day() == 14)

    # 기준선 중앙값 100에서 관측 200을 0으로 바꿔 원래 순증 +100을 -100으로 뒤집는다.
    if fault == "sign":
        frame = frame.with_columns(
            pl.when(event_day).then(0.0).otherwise(pl.col("visitors")).alias("visitors")
        )
    elif fault == "baseline_week":
        # 연천 기준선 날짜만 한 주 밀고 행사일을 덮지 않아 날짜 연결 오류만 격리한다.
        affected = (pl.col("sigungu_code") == "41800") & ~event_day
        shifted = frame.filter(affected).with_columns((pl.col("date") + pl.duration(days=7)).alias("date"))
        frame = pl.concat([frame.filter(~affected), shifted.filter(~event_day)])
    else:
        # 연천 행사에 저신호 의정부 관측을 연결하고 파주 정상 표본은 남긴다.
        events = [
            {**row, "sigungu_code": "41150"} if row["sigungu_code"] == "41800" else row for row in events
        ]
    broken = metrics(events, frame)
    broken["signal_retention"] = signal_retention(broken, previous, "b" * 64)
    assert broken["candidate_count"] == correct["candidate_count"]
    assert broken[gate]["status"] == "fail"
    if fault != "sign":
        assert broken["significant_negative"]["status"] == "pass"
        assert broken["significant_count"] == 20
    with pytest.raises(ValueError, match=gate):
        enforce_silver_gate(broken)
