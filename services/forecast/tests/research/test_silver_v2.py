"""v2의 앞선 회차 입력 공개 제약과 상대 척도 구간 보정을 검증한다."""

import unittest
from datetime import date

import numpy as np
import polars as pl
from crowdcast.research.silver_expansion.estimators import interval_correction
from crowdcast.research.silver_v2.estimators import interval_scale_correction, scale_of
from crowdcast.research.silver_v2.features import add_prior_features


# 같은 시리즈의 세 회차로 공개 전 정답과 겹치는 회차가 새지 않는지 확인한다.
def series_frame() -> pl.DataFrame:
    return pl.DataFrame(
        {
            "event_id": ["a2024", "a2025", "a2026", "b2025"],
            "name": [
                "2024 연천 구석기축제",
                "제2회 연천 구석기축제",
                "2026년 연천 구석기축제",
                "연천 구석기축제",
            ],
            "sigungu_code": ["41800", "41800", "41800", "11110"],
            "start": [date(2024, 5, 1), date(2025, 5, 1), date(2026, 5, 1), date(2025, 5, 1)],
            "end": [date(2024, 5, 5), date(2025, 5, 5), date(2026, 5, 5), date(2025, 5, 5)],
            "as_of": [date(2024, 4, 17), date(2025, 4, 17), date(2026, 4, 17), date(2025, 4, 17)],
            "available_at": [date(2024, 7, 1), date(2026, 4, 30), date(2026, 7, 1), date(2025, 7, 1)],
            "target": [100.0, 300.0, 500.0, 999.0],
        }
    )


# 가짜 행사 시리즈로 실측 자료 없이 v2의 핵심 불변식을 검사한다.
class SilverV2Tests(unittest.TestCase):
    # 이번 D-14보다 늦게 공개된 앞선 회차 정답은 입력에 쓰지 않는다.
    def test_prior_uses_only_published_earlier_editions(self) -> None:
        result, audit = add_prior_features(series_frame())
        rows = {r["event_id"]: r for r in result.to_dicts()}
        self.assertIsNone(rows["a2024"]["prior_target"])
        self.assertEqual(rows["a2025"]["prior_target"], 100.0)
        # 2025 회차 정답은 2026-04-30 공개라 2026 D-14(04-17)에 아직 볼 수 없다.
        self.assertEqual(rows["a2026"]["prior_target"], 100.0)
        self.assertEqual(rows["a2026"]["prior_count"], 1.0)
        self.assertEqual(audit["availability_violations"], 0)

    # 다른 시군구의 같은 이름 행사는 같은 시리즈로 연결하지 않는다.
    def test_series_requires_same_region(self) -> None:
        result, _ = add_prior_features(series_frame())
        row = result.filter(pl.col("event_id") == "b2025").row(0, named=True)
        self.assertIsNone(row["prior_target"])
        self.assertEqual(row["prior_count"], 0.0)

    # 규모가 모두 1이면 상대 척도 보정은 v1의 가산 보정과 같다.
    def test_unit_scale_matches_v1_correction(self) -> None:
        calibration = pl.DataFrame({"window_id": ["a", "b", "c", "d"], "target": [-50.0, 10.0, 80.0, 400.0]})
        predictions = np.array([[0.0, 20.0, 60.0]] * 4)
        self.assertEqual(
            interval_scale_correction(calibration, predictions, np.ones(4)),
            interval_correction(calibration, predictions),
        )

    # 지역 규모가 없거나 0 이하이면 학습에서 정한 대체값을 쓴다.
    def test_scale_fallback(self) -> None:
        frame = pl.DataFrame({"region_daily_mean": [5000.0, None, 0.0]})
        np.testing.assert_array_equal(scale_of(frame, 1234.0), [5000.0, 1234.0, 1234.0])
        np.testing.assert_array_equal(scale_of(frame, None), [1.0, 1.0, 1.0])
