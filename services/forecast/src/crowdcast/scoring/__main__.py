"""선정·규칙 생성·등록 준비·원장 채점을 명령행에서 실행한다."""

import argparse

from crowdcast import paths
from crowdcast.api.assemble.identity import canonical
from crowdcast.data.call_ledger import atomic_write
from crowdcast.scoring import rules
from crowdcast.scoring.register import register
from crowdcast.scoring.score import scores
from crowdcast.scoring.select import load_selection


# 규칙 문서 외 공개 파일은 만들지 않으며 기본 register는 통신 없이 끝낸다.
def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("select")
    registration = commands.add_parser("register")
    mode = registration.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true")
    mode.add_argument("--send", action="store_true")
    commands.add_parser("score")
    args = parser.parse_args(argv)
    if args.command == "select":
        batch, selection = load_selection()
        document = paths.REPO_ROOT / rules.RULES_DOC
        document.parent.mkdir(parents=True, exist_ok=True)
        atomic_write(document, rules.render_rules(batch.metadata, selection["audit"]).encode())
        print(canonical({"metadata": batch.metadata, **selection}))
    elif args.command == "register":
        preparation = register(send=args.send)
        print(canonical({"mode": "send" if args.send else "dry-run", "selection": preparation["selection"],
                         "output": str(paths.PROCESSED / "prereg_payloads.json")}))
    else:
        status_sources: list[dict[str, str]] = []
        result = scores(status_sources=status_sources)
        print(canonical({"scores": result, "statusSources": status_sources}))
    return 0


# 모듈 실행 오류는 성공 종료로 숨기지 않는다.
if __name__ == "__main__":
    raise SystemExit(main())
