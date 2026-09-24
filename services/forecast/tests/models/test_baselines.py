"""기준선 단위·사전 공개·단순 모델 계층의 정답 비의존성을 검증한다."""

import json
from datetime import date
from pathlib import Path

import numpy as np
import polars as pl
import pytest
from crowdcast.models.baselines import SimpleModel, host_expected
from crowdcast.models.train import select_labels


# 단위·공간·예상 시점 중 하나라도 다르면 B2 비교 쌍이 아니다.
@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("unit", "명"),
        ("timeUnit", "기간누적"),
        ("spatialScope", "시군구"),
        ("valueKind", "사후집계"),
        ("announcedAt", "2025-04-20"),
        ("announcedAt", None),
        ("value", -1),
    ],
)
def test_b2_excludes_incomparable(field: str, value: object) -> None:
    quantity = {
        "unit": "명/일",
        "timeUnit": "일",
        "spatialScope": "행사장",
        "valueKind": "사전예상",
        "announcedAt": "2025-04-19",
        "value": 5000,
    }
    row = {"as_of": date(2025, 4, 19), "spatial_scope": "행사장"}
    assert host_expected({"expectedByHost": quantity}, row) == 5000
    quantity[field] = value
    assert host_expected({"expectedByHost": quantity}, row) is None
    assert host_expected({"visitors_announced": 5000}, row) is None


# 단순 모델은 전회차를 우선하고 평가 정답으로 규모 계층을 고르지 않는다.
def test_simple_model_does_not_read_target(model_data: tuple, tmp_path: Path) -> None:
    frame, _ = model_data
    train = frame.filter(pl.col("year") <= 2023)
    evaluation = frame.filter(pl.col("year") == 2025)
    model = SimpleModel().fit(train)
    before = model.predict(evaluation)
    after = model.predict(evaluation.with_columns((pl.col("daily_mean") * 100).alias("daily_mean")))
    np.testing.assert_array_equal(before, after)
    path = tmp_path / "simple.json"
    path.write_text(json.dumps(vars(model)), encoding="utf-8")
    np.testing.assert_array_equal(before, SimpleModel.load(path).predict(evaluation))
    np.testing.assert_array_equal(before, model.fit(train).predict(evaluation))
    for row, prediction in zip(evaluation.to_dicts(), before, strict=True):
        if row["previous_daily_mean"] is not None:
            assert prediction[1] == pytest.approx(row["previous_daily_mean"])


# 비대표·골든 전 출처·코로나·명절 실버를 제외하고 사유를 숨기지 않는다.
def test_training_exclusions(model_data: tuple, config: dict) -> None:
    frame, events = model_data
    rows = frame.head(6).to_dicts()
    for row in rows:
        row.update(is_primary=True, usable_for_training=True, quality_flag="ok")
    rows[0]["year"] = 2021
    rows[1]["quality_flag"] = "holiday_overlap"
    rows[2]["is_primary"] = False
    rows[3]["is_golden"] = True
    rows[4]["usable_for_training"] = False
    selected, excluded = select_labels(pl.DataFrame(rows), list(events.values()), config)
    assert selected["event_id"].to_list() == [rows[5]["event_id"]]
    assert len(excluded) == 5
    assert any("명절 실버 채점 불가" in row["reasons"] for row in excluded)


# 유형마다 다른 학습 중앙값을 쓰며 없는 유형에 전체 중앙값을 B0로 보고하지 않는다.
def test_b0_uses_training_type_medians() -> None:
    training = pl.DataFrame({"type": [0.0, 0.0, 5.0, 5.0], "daily_mean": [800, 1200, 4000, 6000]})
    model = SimpleModel().fit(training)
    assert model.b0({"type": 0.0}) == 1000
    assert model.b0({"type": 5.0}) == 5000
    assert model.b0({"type": 1.0}) is None
    assert model.center({"type": 1.0}) == 2600
