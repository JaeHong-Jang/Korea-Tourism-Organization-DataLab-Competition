"""python -m knowledge.lineage load 명령으로 기준 그래프에 계보 파일을 적재한다."""

import argparse
import logging
from pathlib import Path

from knowledge import paths
from knowledge.api.model_runs import load_promoted_model
from knowledge.lineage.load import load_lineage
from knowledge.store.facts import KnowledgeStore


# 서버와 같은 모델 카드 선행 적재 및 기준 저장소를 사용한다.
def main() -> None:
    parser = argparse.ArgumentParser(description="파이프라인 계보 적재")
    parser.add_argument("command", choices=["load"])
    parser.add_argument("path", type=Path)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    store = KnowledgeStore(paths.STORE)
    load_promoted_model(store)
    try:
        version = load_lineage(args.path, store.repository)
    except (OSError, ValueError) as error:
        parser.exit(1, f"계보 적재 실패: {type(error).__name__}\n")
    print(f"masterVersion={version}")


if __name__ == "__main__":
    main()
