"""파이프라인을 실행하지 않고 저장된 자산 계보를 JSON으로 내보낸다."""

import argparse
from pathlib import Path

from crowdcast.pipeline.dagster_defs.lineage import export_lineage


# 내보내기 경로는 명시적으로 받고 잘못된 인자는 파일을 만들기 전에 거부한다.
def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    lineage = commands.add_parser("lineage", help="저장된 실행의 자산·파일 계보 내보내기")
    lineage.add_argument("--out", type=Path, required=True)
    args = parser.parse_args(argv)
    export_lineage(args.out)
    print(args.out)
    return 0


# 모듈 진입점에서는 기존 CLI와 별개의 읽기 전용 계보 명령만 실행한다.
if __name__ == "__main__":
    raise SystemExit(main())
