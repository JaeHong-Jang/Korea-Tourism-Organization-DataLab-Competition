"""선택한 파이프라인 단계를 실행하고 게이트 실패 즉시 계약 실행 기록을 확정한다."""

import argparse
from contextlib import ExitStack
from time import perf_counter_ns
from typing import Any

from crowdcast.data.call_ledger import korea_today
from crowdcast.data.datago_client import DataGoClient, safe_error
from crowdcast.pipeline import run_record, stages


# 공개 단계는 모든 선행 단계의 실제 통과가 확인될 때만 통과시킨다.
def publish_gate(record: dict[str, Any], dry: bool) -> dict[str, Any]:
    previous = record["stages"][:-1]
    absent = [
        row["name"] for row in previous if row["status"] != "passed" or row["gate"]["passed"] is not True
    ]
    if dry or absent:
        return {
            "passed": None,
            "message": "publish 미실행: " + ("dry 검사" if dry else ", ".join(absent) + " 미통과"),
        }
    return {"passed": True, "message": "선행 게이트 전부 통과; 실행 기록 발행 (모델 승격은 후속 통합)"}


# fetch만 같은 클라이언트·총 호출 예산으로 한 번 재시도하고 시도별 결과를 모두 남긴다.
def run_stage(name: str, record: dict[str, Any], dry: bool, client: DataGoClient | None) -> dict[str, Any]:
    if name == "publish":
        return publish_gate(record, dry)
    if missing := stages.missing_entrypoint(name):
        return {"passed": None, "message": f"진입점 없음: {missing}; skipped"}
    messages = []
    attempts = 2 if name == "fetch" and not dry else 1
    for attempt in range(attempts):
        try:
            gate = (
                stages.inspect_stage(name, korea_today())
                if dry
                else stages.execute_stage(name, korea_today(), client)
            )
        except Exception as exc:
            gate = {"passed": False, "message": f"{type(exc).__name__}: {safe_error(exc)}"}
        messages.append((f"시도 {attempt + 1}: " if attempts > 1 else "") + gate["message"])
        if gate["passed"] is not False:
            break
    return {"passed": gate["passed"], "message": " | ".join(messages)}


# 인자·범위를 먼저 검증해 잘못된 요청은 기록과 산출물을 만들지 않는다.
def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--from", dest="first", choices=stages.STAGES, default="fetch")
    parser.add_argument("--to", dest="last", choices=stages.STAGES, default="publish")
    parser.add_argument(
        "--dry", action="store_true", help="단계 실행 없이 입력·게이트를 검사하고 dry 기록만 저장"
    )
    parser.add_argument("--max-calls", type=int, default=0, help="재시도를 포함한 방문자 외부 호출 총예산")
    args = parser.parse_args(argv)
    if args.max_calls < 0:
        parser.error("--max-calls는 0 이상이어야 합니다")
    try:
        selected = stages.select_stages(args.first, args.last)
    except ValueError as exc:
        parser.error(str(exc))
    record = run_record.new_record(stages.STAGES, selected, args.dry)
    run_record.write_record(record)

    # 각 상태 전이도 저장해 긴 실행 도중 운영 화면에서 진행 상황을 읽을 수 있게 한다.
    with ExitStack() as stack:
        client = None
        for stage in record["stages"]:
            name = stage["name"]
            if name not in selected:
                continue
            stage["status"] = "running"
            stage["gate"]["message"] = "dry 검사 중" if args.dry else "실행 중"
            run_record.write_record(record)
            started = perf_counter_ns()
            try:
                if name == "fetch" and not args.dry:
                    client = stack.enter_context(DataGoClient(max_calls=args.max_calls))
                gate = run_stage(name, record, args.dry, client)
                # dry와 미실행 단계에는 기존 파일을 새 산출물처럼 기록하지 않는다.
                if not args.dry and gate["passed"] is not None:
                    stage["artifacts"] = run_record.artifacts(stages.output_files(name))
            except Exception as exc:
                gate = {"passed": False, "message": f"{type(exc).__name__}: {safe_error(exc)}"}
            stage["gate"] = gate
            stage["status"] = (
                "skipped" if gate["passed"] is None else ("passed" if gate["passed"] else "failed")
            )
            stage["ms"] = (perf_counter_ns() - started) // 1_000_000
            run_record.write_record(record)
            print(f"{name}: {stage['status']} — {gate['message']}", flush=True)
            if stage["status"] == "failed":
                break

    # 실패 뒤 선택 단계는 초기 pending 상태 그대로 두고 종료 코드를 명확하게 전달한다.
    run_record.finish_record(record, args.dry)
    path = run_record.write_record(record)
    print(f"{record['summary']}\n{path}")
    return 1 if record["status"] == "failed" else 0


# python -m crowdcast.pipeline 호출에서 파이프라인 종료 코드를 셸에 전달한다.
if __name__ == "__main__":
    raise SystemExit(main())
