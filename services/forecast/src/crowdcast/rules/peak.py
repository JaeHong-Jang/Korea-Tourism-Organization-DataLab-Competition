"""일평균 분위수와 두 환산 가정으로 순간 최대 표본 및 추정 근거를 만든다."""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from functools import lru_cache
from typing import Any
from zoneinfo import ZoneInfo

import numpy as np
import yaml
from numpy.typing import NDArray
from scipy.special import ndtri

from crowdcast.paths import REPO_ROOT
from crowdcast.rules.evidence import assumption_evidence


# 인원 표시에만 0.5 올림을 적용하고 모델 분위수와 판정 표본은 그대로 둔다.
def round_people(value: float) -> int:
    return int(Decimal(str(value)).to_integral_value(rounding=ROUND_HALF_UP))


# 한 번 생성한 최종 표본을 판정과 표시 수치에 함께 사용한다.
@dataclass(frozen=True)
class PeakSamples:
    samples: NDArray[np.float64]
    assumption_ids: list[str]
    assumptions: list[dict[str, Any]]
    evidence: list[dict[str, Any]]

    # 추정 표시와 두 가정 연결을 갖춘 순간 최대 수치 노드를 만든다.
    def quantity(self, quantity_id: str) -> dict[str, Any]:
        p10, p50, p90 = np.quantile(self.samples, [0.1, 0.5, 0.9])
        return {
            "id": quantity_id,
            "name": "순간 최대",
            "value": None,
            "p10": float(p10),
            "p50": float(p50),
            "p90": float(p90),
            "unit": "명",
            "timeUnit": "순간",
            "spatialScope": "행사장",
            "valueKind": "예측",
            "estimated": True,
            "assumptionIds": list(self.assumption_ids),
            "announcedAt": None,
        }


# 초기 환산 가정을 설정 파일에서 한 번 읽는다.
@lru_cache(maxsize=1)
def _profiles() -> dict[str, Any]:
    return yaml.safe_load((REPO_ROOT / "configs/peak_profiles.yaml").read_text(encoding="utf-8"))


# 음수·비유한 분위수는 거부하고 보정 후 교차한 분위수는 정렬한다.
def _quantiles(daily_quantiles: Mapping[str, Any] | Sequence[float]) -> NDArray[np.float64]:
    values = (
        [daily_quantiles[key] for key in ("p10", "p50", "p90")]
        if isinstance(daily_quantiles, Mapping)
        else daily_quantiles
    )
    quantiles = np.asarray(values, dtype=np.float64)
    if quantiles.shape != (3,) or not np.isfinite(quantiles).all() or (quantiles < 0).any():
        raise ValueError("일평균 분위수는 유한한 음수 아닌 p10·p50·p90 세 값이어야 합니다.")
    return np.sort(quantiles)


# 로그 공간에서 세 분위수를 단조 보간하고 양쪽 꼬리를 로그정규 형태로 잇는다.
def _daily_samples(quantiles: NDArray[np.float64], probabilities: NDArray[np.float64]) -> NDArray[np.float64]:
    logs = np.log1p(quantiles)
    interior = np.interp(probabilities, [0.1, 0.5, 0.9], logs)
    z = ndtri(np.clip(probabilities, np.finfo(float).eps, 1 - np.finfo(float).eps))
    lower = logs[1] + z * (logs[1] - logs[0]) / ndtri(0.9)
    upper = logs[1] + z * (logs[2] - logs[1]) / ndtri(0.9)
    joined = np.where(probabilities < 0.1, lower, np.where(probabilities > 0.9, upper, interior))
    with np.errstate(over="ignore"):
        samples = np.expm1(np.maximum(joined, 0))
    if not np.isfinite(samples).all():
        raise ValueError("일평균 분포의 꼬리가 표현 가능한 수치 범위를 초과했습니다.")
    return samples


# 행사 시작·종료를 한국 시각으로 정규화해 개최 일수와 주말 포함 여부를 계산한다.
def _calendar(event: Mapping[str, Any]) -> tuple[int, bool]:
    starts_at = datetime.fromisoformat(event["startsAt"])
    ends_at = datetime.fromisoformat(event["endsAt"])
    if starts_at.tzinfo is None or ends_at.tzinfo is None or ends_at < starts_at:
        raise ValueError("행사 일시는 시간대가 있어야 하며 종료가 시작보다 빠를 수 없습니다.")
    korea = ZoneInfo("Asia/Seoul")
    start, end = starts_at.astimezone(korea).date(), ends_at.astimezone(korea).date()
    days = (end - start).days + 1
    weekend = any((start + timedelta(days=offset)).weekday() >= 5 for offset in range(min(days, 7)))
    return days, weekend


# 개최일과 유형에서 적용할 피크일 계수·체류율의 값과 범위를 명시한다.
def _assumptions(event: Mapping[str, Any]) -> list[dict[str, Any]]:
    settings = _profiles()
    if event["type"] not in settings["profiles"]:
        raise ValueError("행사 유형은 계약의 일곱 유형 중 하나여야 합니다.")
    days, weekend = _calendar(event)
    day = settings["peak_day"]
    key = "one_day" if days == 1 else "two_or_three_days" if days <= 3 else "four_or_more_days"
    factor = day[key] + (day["weekend_increment"] if weekend else 0)
    profile = settings["profiles"][event["type"]]
    rate = profile["stay_hours"] / profile["operating_hours"] * profile["peak_factor"]
    spread = settings["stay_half_range"]
    return [
        {
            "id": day["id"],
            "name": "피크일 계수",
            "value": factor,
            "low": round(factor - day["half_range"], 12),
            "high": round(factor + day["half_range"], 12),
            "unit": "배",
            "basis": "가정",
            "note": f"docs/plan/06 §4 초기 가정; {days}일 행사; 주말 포함={weekend}; 범위 균등 샘플링.",
        },
        {
            "id": profile["id"],
            "name": f"동시체류율({event['type']})",
            "value": min(1.0, rate),
            "low": min(1.0, rate * (1 - spread)),
            "high": min(1.0, rate * (1 + spread)),
            "unit": "비율",
            "basis": "가정",
            "note": (
                f"docs/plan/06 §4 초기 가정; 운영 {profile['operating_hours']}시간, "
                f"체류 {profile['stay_hours']}시간, 피크계수 {profile['peak_factor']}; "
                "체류시간 ±20% 균등 샘플링 후 상한 1 적용."
            ),
        },
    ]


# 지역 난수 생성기로 일평균·피크일·체류시간을 독립 샘플링해 최종 표본을 고정한다.
def sample_peak(
    daily_quantiles: Mapping[str, Any] | Sequence[float],
    event: Mapping[str, Any],
    n: int = 4000,
    *,
    seed: int,
) -> PeakSamples:
    if isinstance(n, bool) or not isinstance(n, int) or n < 1:
        raise ValueError("표본 수는 양의 정수여야 합니다.")
    if isinstance(seed, bool) or not isinstance(seed, int) or seed < 0:
        raise ValueError("재현용 seed는 음수 아닌 정수여야 합니다.")
    quantiles = _quantiles(daily_quantiles)
    assumptions = _assumptions(event)
    rng = np.random.default_rng(seed)
    daily = _daily_samples(quantiles, rng.random(n))

    # 동시체류율을 직접 균등 추출하지 않고 체류시간부터 뽑아 상한의 확률질량을 보존한다.
    day, concurrency = assumptions
    factors = rng.uniform(day["low"], day["high"], n)
    profile = _profiles()["profiles"][event["type"]]
    spread = _profiles()["stay_half_range"]
    stay = rng.uniform(profile["stay_hours"] * (1 - spread), profile["stay_hours"] * (1 + spread), n)
    rates = np.minimum(1.0, stay / profile["operating_hours"] * profile["peak_factor"])
    with np.errstate(over="ignore"):
        samples = daily * factors * rates
    if not np.isfinite(samples).all():
        raise ValueError("순간 최대 표본이 표현 가능한 수치 범위를 초과했습니다.")
    samples.setflags(write=False)

    # 동일한 입력·설정·seed에서 가정 근거 식별자도 그대로 재현되도록 구성한다.
    inputs = {
        "dailyQuantiles": quantiles.tolist(),
        "eventId": event.get("id"),
        "type": event["type"],
        "startsAt": event["startsAt"],
        "endsAt": event["endsAt"],
        "n": n,
        "seed": seed,
    }
    evidence = [assumption_evidence(assumption, inputs=inputs) for assumption in assumptions]
    return PeakSamples(samples, [day["id"], concurrency["id"]], assumptions, evidence)
