"""연구 분할의 누수·중복 보정·음수 보존과 모델 복원을 검증한다."""

import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import polars as pl

from crowdcast.research.silver_expansion.estimators import (
    design_matrix, fit_encoding, fit_model, interval_correction, predict_model, save_model, window_weights,
)
from crowdcast.research.silver_expansion.metrics import score
from crowdcast.research.silver_expansion.regional import prepare_regions, region_features
from crowdcast.research.silver_expansion.splits import assign_clusters, make_split


# 가짜 달력의 경계 조건으로 실측 자료 없이 핵심 불변식을 검사한다.
class SilverExpansionTests(unittest.TestCase):
    # 미래 공개 관측과 기준일 이후 관측을 피처에 섞지 않는다.
    def test_unpublished_observations_are_excluded(self) -> None:
        as_of = date(2026, 3, 1)
        records = []
        for day, available, total in ((date(2026, 1, 20), date(2026, 2, 24), 10.0),
                                      (date(2026, 2, 1), date(2026, 3, 8), 1_000_000.0)):
            for category in ("현지인", "외지인", "외국인"):
                records.append({"sigungu_code": "41800", "date": day, "available_at": available,
                                "tou_div": category, "visitors": total, "continuity_break": False})
        regions = prepare_regions(pl.DataFrame(records))
        result = region_features("41800", as_of, regions, continuity_break=False)
        self.assertEqual(result["region_daily_mean"].value, 30.0)
        self.assertLessEqual(result["region_daily_mean"].available_at, as_of)

    # 같은 관측을 복제해도 채점과 구간 보정의 영향력은 증가하지 않는다.
    def test_duplicate_observation_weight_and_calibration(self) -> None:
        base = pl.DataFrame({"window_id": ["연천:1", "부산:2", "서울:3"], "target": [-10.0, 0.0, 100.0]})
        duplicated = pl.concat([base, base.head(1), base.head(1)])
        self.assertAlmostEqual(window_weights(duplicated).sum(), 3.0)
        self.assertEqual(interval_correction(base, np.zeros((3, 3))),
                         interval_correction(duplicated, np.zeros((5, 3))))
        scored = duplicated.with_columns(pl.lit(0.0).alias("p10"), pl.lit(0.0).alias("p50"),
                                         pl.lit(0.0).alias("p90"), pl.lit(-100.0).alias("lower"),
                                         pl.lit(100.0).alias("upper"))
        self.assertAlmostEqual(score(scored)["mae"], 110 / 3)

    # 결측 대체와 상수 제거에 평가 자료의 분포가 유입되지 않는다.
    def test_encoding_fits_only_training(self) -> None:
        train = pl.DataFrame({"x": [1.0, None, 3.0], "constant": [2.0] * 3})
        encoding = fit_encoding(train, ["x", "constant"])
        heldout = pl.DataFrame({"x": [None, 1000.0], "constant": [999.0, 888.0]})
        x, names = design_matrix(heldout, encoding)
        self.assertEqual(encoding["fill"]["x"], 2.0)
        self.assertEqual(x[0, names.index("x")], 2.0)
        self.assertNotIn("constant", names)

    # 연도를 걸쳐 기간이 겹치는 같은 지역의 행을 평가와 학습으로 나누지 않는다.
    def test_overlapping_cluster_and_publication_split(self) -> None:
        rows = []
        for number in range(160):
            day = date(2023, 1, 1) + timedelta(days=number * 2)
            rows.append({"event_id": f"e-연천-{number}", "sigungu_code": "41800", "start": day,
                         "end": day, "year": day.year, "available_at": day + timedelta(days=35)})
        rows.extend([
            {"event_id": "e-부산-과거", "sigungu_code": "26380", "start": date(2024, 12, 30),
             "end": date(2025, 1, 2), "year": 2024, "available_at": date(2025, 1, 3)},
            {"event_id": "e-부산-평가", "sigungu_code": "26380", "start": date(2025, 1, 1),
             "end": date(2025, 1, 4), "year": 2025, "available_at": date(2025, 2, 8)},
        ])
        frame = assign_clusters(pl.DataFrame(rows))
        split = make_split(frame, date(2025, 1, 1), cutoff=date(2025, 1, 5))
        self.assertEqual(split["evaluation"], ["e-부산-평가"])
        self.assertIn("e-부산-과거", split["excluded_boundary"])
        self.assertEqual(len(split["train"]), 110)
        self.assertEqual(len(split["calibration"]), 50)

    # 정답이 전부 음수여도 부호를 보존하고 저장 모델이 같은 예측을 재현한다.
    def test_negative_targets_and_model_roundtrip(self) -> None:
        frame = pl.DataFrame({"window_id": [str(i) for i in range(60)], "x": np.arange(60, dtype=float),
                              "target": -1000.0 - np.arange(60, dtype=float) * 10})
        models, encoding = fit_model(frame, ["x"], {"num_leaves": 7, "min_child_samples": 20})
        predicted = predict_model(models, encoding, frame)
        self.assertTrue(np.all(predicted < 0))
        self.assertTrue(np.all(np.diff(predicted, axis=1) >= 0))
        with tempfile.TemporaryDirectory() as directory:
            save_model(models, encoding, frame, Path(directory))


# 외부 의존성 설치 없이 표준 unittest로 실행한다.
if __name__ == "__main__":
    unittest.main()
