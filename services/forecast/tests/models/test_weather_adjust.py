"""과거 강수일이 있을 때만 표본 기반 배수를 추정하고 결측·골든·미공개 행사를 제외한다."""

import subprocess
import sys
from datetime import date, timedelta
from pathlib import Path

import polars as pl
import pytest
from crowdcast.features.weather_history import daily_rain, weather_samples
from crowdcast.models.weather_adjust import AdjustmentConfig, fit, load_config


# 같은 유형의 우천·건조 행사와 원본 계보를 가진 소형 과거 표를 만든다.
@pytest.fixture
def history(tmp_path: Path) -> Path:
    events, labels, weather = [], [], []
    for index in range(8):
        day = date(2024, 9, 1) + timedelta(days=index)
        event_id = f"e-yeongjong-fireworks-2024-{index}"
        events.append({"event_id": event_id, "name": "영종 씨사이드파크 불꽃축제",
                       "start": day, "end": day, "type": "불꽃", "sigungu_code": "28110",
                       "is_golden": False})
        labels.append({"event_id": event_id, "label_tier": "silver", "is_primary": True,
                       "usable_for_training": True, "available_at": day + timedelta(days=35),
                       "daily_mean": 800 if index < 4 else 1000, "is_golden": False,
                       "quality_flag": "ok"})
        weather.append({"sigungu_code": "28110", "date": day, "precipitation_mm": 10 if index < 4 else 0})
    for name, rows in (("events", events), ("labels", labels), ("weather_daily", weather)):
        pl.DataFrame(rows).write_parquet(tmp_path / f"{name}.parquet")
    return tmp_path


# 우천·건조 중앙값 비율과 양쪽 표본 수·기간·원본 해시를 확인한다.
def test_fit_rain_ratio(history: Path) -> None:
    result = fit(history, AdjustmentConfig(min_samples=3), as_of=date(2025, 1, 1))
    assert len(result.coefficients) == 1
    coefficient = result.coefficients[0]
    assert coefficient.multiplier == 0.8
    assert coefficient.sample_count == coefficient.dry_sample_count == 4
    assert coefficient.period_from == date(2024, 9, 1) and coefficient.period_to == date(2024, 9, 8)
    assert "weather_daily.parquet sha256=" in coefficient.source
    assert fit(history, AdjustmentConfig(min_samples=5), as_of=date(2025, 1, 1)).coefficients == []


# 골든·품질 부적합·공개 전 라벨은 계수 표본에 포함하지 않는다.
@pytest.mark.parametrize("field,value", [("is_golden", True), ("usable_for_training", False),
                                       ("is_primary", False), ("quality_flag", "holiday_overlap"),
                                       ("available_at", date(2099, 1, 1))])
def test_excluded_labels(history: Path, field: str, value: object) -> None:
    labels = pl.read_parquet(history / "labels.parquet").with_columns(pl.lit(value).alias(field))
    samples = weather_samples(pl.read_parquet(history / "weather_daily.parquet"),
                              pl.read_parquet(history / "events.parquet"), labels, as_of=date(2025, 1, 1))
    assert samples.is_empty()


# 강수 결측은 무강수로 대체하지 않고 다른 시군구·누락 날짜도 표본에서 뺀다.
def test_missing_weather_not_dry(history: Path) -> None:
    weather = pl.read_parquet(history / "weather_daily.parquet").with_columns(
        pl.when(pl.col("precipitation_mm") == 10).then(None)
        .otherwise(pl.col("precipitation_mm")).alias("precipitation_mm")
    )
    weather.write_parquet(history / "weather_daily.parquet")
    assert fit(history, AdjustmentConfig(min_samples=3), as_of=date(2025, 1, 1)).coefficients == []
    with pytest.raises(ValueError, match="중복"):
        daily_rain(pl.concat([weather, weather]))


# 자료 없음은 정상 종료하며 이미 있는 계수 파일을 삭제하거나 빈 값으로 덮어쓰지 않는다.
def test_fit_cli_without_data(tmp_path: Path) -> None:
    config = tmp_path / "weather_adjustment.yaml"
    config.write_text("# 보존할 설정\nmin_samples: 3\ncoefficients: []\n")
    original = config.read_bytes()
    result = subprocess.run(
        [sys.executable, "-m", "crowdcast.models.weather_adjust", "fit",
         "--processed", str(tmp_path), "--config", str(config)],
        capture_output=True, text=True, timeout=30,
    )
    assert result.returncode == 0, result.stderr
    assert "자료 없음" in result.stdout and "weather_daily.parquet" in result.stdout
    assert config.read_bytes() == original


# 추정 명령이 만든 설정은 실제 요청 선택기가 쓰는 동일한 검증 형식으로 읽힌다.
def test_fit_cli_with_data(history: Path) -> None:
    config = history / "weather_adjustment.yaml"
    config.write_text("min_samples: 3\ncoefficients: []\n")
    result = subprocess.run(
        [sys.executable, "-m", "crowdcast.models.weather_adjust", "fit",
         "--processed", str(history), "--config", str(config), "--as-of", "2025-01-01"],
        capture_output=True, text=True, timeout=30,
    )
    assert result.returncode == 0, result.stderr
    assert load_config(config).coefficients[0].multiplier == 0.8
