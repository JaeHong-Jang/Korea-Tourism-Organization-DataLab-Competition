"""명시한 사용 모델 실행과 도전 모델을 비교하는 독립 명령을 제공한다."""

import argparse
import json

from crowdcast.models.challenger.config import ChallengerConfig
from crowdcast.models.challenger.runner import execute


# 설정은 명령에 명시하고 실행 결과에 그대로 기록해 평가 후 숨은 튜닝을 막는다.
def main() -> None:
    parser = argparse.ArgumentParser(description="동일 롤링 폴드 PyMC 도전 모델 비교(승격 없음)")
    parser.add_argument("--run", required=True, help="비교할 기존 백테스트 runId")
    parser.add_argument("--method", choices=("advi", "nuts"), default="advi")
    parser.add_argument("--seed", type=int, default=2026)
    parser.add_argument("--draws", type=int, default=1000)
    parser.add_argument("--iterations", type=int, default=10000)
    parser.add_argument("--chains", type=int, default=2)
    parser.add_argument("--tune", type=int, default=300)
    args = vars(parser.parse_args())
    run_id = args.pop("run")
    print(json.dumps(execute(run_id, ChallengerConfig(**args)), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
