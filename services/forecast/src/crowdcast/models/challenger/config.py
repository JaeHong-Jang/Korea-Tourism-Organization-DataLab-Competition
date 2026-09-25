"""도전 모델의 재현 가능한 추론 설정과 기본 꺼짐인 합의 근거 설정을 정의한다."""

from dataclasses import asdict, dataclass
from typing import Any


# 짧은 비교 실행은 ADVI로 고정하며 MCMC를 요청한 경우에만 체인·워밍업을 사용한다.
@dataclass(frozen=True)
class ChallengerConfig:
    method: str = "advi"
    seed: int = 2026
    draws: int = 1000
    iterations: int = 10000
    chains: int = 2
    tune: int = 300
    agreement_enabled: bool = False

    # 잘못된 설정으로 빈 사후분포나 재현 불가능한 난수 상태를 만들지 않는다.
    def __post_init__(self) -> None:
        if self.method not in {"advi", "nuts"}:
            raise ValueError("추론 방식은 advi 또는 nuts여야 합니다")
        if min(self.draws, self.iterations, self.chains, self.tune) < 1 or self.seed < 0:
            raise ValueError("추론 횟수는 양수, 시드는 음이 아닌 정수여야 합니다")

    # 실행에 실제 적용한 설정을 그대로 보고서에 남긴다.
    def document(self) -> dict[str, Any]:
        return asdict(self)
