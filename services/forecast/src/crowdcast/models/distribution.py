"""보정 분위수를 기존 순간 최대 환산과 단일 판정 함수에 연결한다."""

from collections.abc import Sequence
from typing import Any

from crowdcast.rules.judge import JudgmentResult, judge
from crowdcast.rules.peak import PeakSamples, sample_peak


# 인원과 판정은 같은 불변 표본을 공유하며 환산 산식은 이 층에서 만들지 않는다.
def distribution(
    quantiles: Sequence[float],
    event: dict[str, Any],
    *,
    seed: int = 2026,
    n: int = 4000,
    basis: str = "확률",
) -> tuple[PeakSamples, JudgmentResult]:
    peak = sample_peak(quantiles, event, n=n, seed=seed)
    return peak, judge(peak.samples, event, basis=basis)
