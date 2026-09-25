"""표본과 출처가 있는 과거 우천 계수만 선택하며 ASOS 자료가 없으면 추정을 생략한다."""

import argparse
import hashlib
from datetime import date
from pathlib import Path
from typing import Literal

import polars as pl
import yaml
from crowdcast import paths
from crowdcast.data.weather import service
from crowdcast.features.weather_history import weather_samples
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

NO_ADJUSTMENT = "날씨 보정 없음 — 유형별 과거 우천·건조 행사 표본 부족"


# 기간 역전과 출처 누락을 막아 설정에 숫자만 적은 계수가 적용되지 않게 한다.
class Coefficient(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    type: Literal["불꽃", "공연", "대학", "먹거리", "꽃", "전통", "기타"]
    rain_grade: Literal["우천"]
    multiplier: float = Field(ge=0.5, le=1.2)
    sample_count: int = Field(ge=1, strict=True)
    dry_sample_count: int = Field(ge=1, strict=True)
    period_from: date
    period_to: date
    source: str = Field(min_length=1)

    # 기준 그래프 범위와 관측 기간을 벗어난 계수는 조용히 잘라 쓰지 않는다.
    @model_validator(mode="after")
    def valid_period(self) -> "Coefficient":
        if self.period_from > self.period_to or not self.source.strip():
            raise ValueError("날씨 계수의 추정 기간과 출처가 필요합니다")
        return self


# 하한은 우천·건조 표본 양쪽에 적용하고 같은 유형의 중복 계수는 거부한다.
class AdjustmentConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    min_samples: int = Field(default=30, ge=1, strict=True)
    coefficients: list[Coefficient] = Field(default_factory=list)

    # 순서에 따라 적용 배수가 달라지는 설정을 차단한다.
    @model_validator(mode="after")
    def unique_coefficients(self) -> "AdjustmentConfig":
        keys = [(item.type, item.rain_grade) for item in self.coefficients]
        if len(keys) != len(set(keys)):
            raise ValueError("유형·강수 등급별 계수 중복")
        return self


# 빈 파일과 미설정은 표본 없는 기본 상태이며 파일 교체는 다음 요청에서 반영한다.
def load_config(path: Path | None = None) -> AdjustmentConfig:
    path = path or paths.REPO_ROOT / "configs/weather_adjustment.yaml"
    if not path.exists():
        return AdjustmentConfig()
    return AdjustmentConfig.model_validate(yaml.safe_load(path.read_text(encoding="utf-8")) or {})


# 강수확률을 강수량으로 바꾸지 않고 실제 우천 점검과 같은 경계에서만 우천 계수를 쓴다.
def select_coefficient(event_type: str, weather: dict, *, as_of: date) -> tuple[Coefficient | None, str]:
    try:
        config = load_config()
    except (OSError, ValueError, yaml.YAMLError):
        return None, "날씨 보정 없음 — 보정 계수 설정 오류"
    coefficient = next((item for item in config.coefficients if item.type == event_type
                        and min(item.sample_count, item.dry_sample_count) >= config.min_samples
                        and item.period_to < as_of), None)
    if coefficient is None:
        return None, NO_ADJUSTMENT if not config.coefficients else (
            "날씨 보정 없음 — 해당 유형의 과거 강수일 표본 부족 또는 추정 기간 부적합"
        )

    # 유효한 계수가 있어도 강수 정보가 없거나 무강수 예보이면 우천 효과를 적용하지 않는다.
    rainy = weather.get("pty") in {"비", "비/눈", "눈", "소나기"} or (weather.get("pop") or 0) >= 30
    if not rainy:
        missing = weather.get("pop") is None and weather.get("pty") is None
        reason = "강수 정보 미제공" if missing else "무강수 예보(우천 계수 미적용)"
        return None, "날씨 보정 없음 — " + reason
    return coefficient, "날씨 보정 추정"


# 자료가 갖춰졌을 때만 우천 행사와 건조 행사의 실버 순증 중앙값 비율을 계산한다.
def fit(processed: Path, config: AdjustmentConfig, *, as_of: date) -> AdjustmentConfig:
    files = {name: processed / f"{name}.parquet" for name in ("weather_daily", "events", "labels")}
    samples = weather_samples(*(pl.read_parquet(path) for path in files.values()), as_of=as_of)
    source = "; ".join(f"{path.name} sha256={hashlib.sha256(path.read_bytes()).hexdigest()}"
                       for path in files.values())
    coefficients = []
    for event_type in sorted(samples["type"].unique().to_list()):
        group = samples.filter(pl.col("type") == event_type)
        wet = group.filter(pl.col("rain_grade") == "우천")
        dry = group.filter(pl.col("rain_grade") == "무강수")
        if min(wet.height, dry.height) < config.min_samples:
            continue
        multiplier = wet["daily_mean"].median() / dry["daily_mean"].median()
        if not 0.5 <= multiplier <= 1.2:
            continue
        coefficients.append(Coefficient(
            type=event_type, rain_grade="우천", multiplier=multiplier,
            sample_count=wet.height, dry_sample_count=dry.height,
            period_from=group["start"].min(), period_to=group["end"].max(),
            source=f"ASOS 일강수량·실버 순증 중앙값 우천/건조 비교(인과효과 아님); {source}",
        ))
    return AdjustmentConfig(min_samples=config.min_samples, coefficients=coefficients)


# 누락 자료는 성공적으로 생략하고 기존 설정을 덮어쓰지 않으며 외부 수집은 하지 않는다.
def main() -> int:
    parser = argparse.ArgumentParser(description="과거 일강수량으로 유형별 우천 배수를 추정한다")
    parser.add_argument("command", choices=["fit"])
    parser.add_argument("--processed", type=Path, default=paths.PROCESSED)
    parser.add_argument("--config", type=Path, default=paths.REPO_ROOT / "configs/weather_adjustment.yaml")
    parser.add_argument("--as-of", type=date.fromisoformat, default=service.now().date())
    args = parser.parse_args()
    missing = [name for name in ("weather_daily", "events", "labels")
               if not (args.processed / f"{name}.parquet").exists()]
    if missing:
        print("자료 없음 — " + ", ".join(f"{name}.parquet" for name in missing))
        return 0
    try:
        result = fit(args.processed, load_config(args.config), as_of=args.as_of)
    except (ValueError, OSError, ValidationError, pl.exceptions.PolarsError, yaml.YAMLError) as error:
        parser.exit(1, f"날씨 계수 추정 실패: {error}\n")
    args.config.write_text(
        "# 과거 우천·건조 행사 실버 순증 비교로 추정한 날씨 배수(인과효과 아님).\n"
        + yaml.safe_dump(result.model_dump(mode="json"), allow_unicode=True, sort_keys=False),
        encoding="utf-8",
    )
    print(f"날씨 계수 {len(result.coefficients)}개 저장 — {args.config}")
    return 0


# 모듈 실행은 자료 확인과 추정만 수행하며 학습·배치 예보에는 연결하지 않는다.
if __name__ == "__main__":
    raise SystemExit(main())
