"""선택한 파이프라인 단계를 실행하고 게이트 실패 즉시 계약 실행 기록을 확정한다."""

import argparse
import json
from contextlib import ExitStack
from pathlib import Path
from time import perf_counter_ns
from typing import Any

import httpx
from crowdcast import paths
from crowdcast.data.call_ledger import korea_today
from crowdcast.data.datago_client import DataGoError, TransientDataGoError, safe_error
from crowdcast.pipeline import gates, run_record, stages, summary
from jsonschema import ValidationError


# 공개 단계는 모든 선행 단계의 실제 통과가 확인될 때만 통과시킨다.
def publish_gate(record: dict[str, Any], dry: bool) -> dict[str, Any]:
    previous = record["stages"][:-1]
    absent = [
        row["name"] for row in previous if row["status"] != "passed" or row["gate"]["passed"] is not True
    ]
    # 사용 허용(승격된 모델)과 검증 상태(verdict)를 실행 기록에 함께 남겨 미검증이 통과로 읽히지 않게 한다.
    pointer = paths.REPORTS / "backtest/promoted.json"
    promoted = json.loads(pointer.read_bytes()) if pointer.is_file() else None
    usage = (
        f"; 사용 모델 {promoted['modelVersion']}(verdict={promoted.get('verdict', '미기록')})"
        if promoted
        else "; 사용 모델 없음"
    )
    if dry or absent:
        return {
            "passed": None,
            "message": "publish 미실행: " + ("dry 검사" if dry else ", ".join(absent) + " 미통과") + usage,
        }
    return {"passed": True, "message": "선행 게이트 전부 통과; 실행 기록 발행 (승격은 backtest 단계)" + usage}


# 기존 수집기가 감싼 예외도 원인 체인에서 확인하며 데이터 오류는 재시도하지 않는다.
def transient_error(exc: BaseException) -> bool:
    seen: set[int] = set()
    while exc is not None and id(exc) not in seen:
        seen.add(id(exc))
        if isinstance(
            exc,
            (TransientDataGoError, httpx.TimeoutException, httpx.NetworkError, ConnectionError, TimeoutError),
        ):
            return True
        if isinstance(exc, httpx.HTTPStatusError) and (
            exc.response.status_code == 429 or 500 <= exc.response.status_code < 600
        ):
            return True
        if isinstance(exc, DataGoError) and str(exc) == "공공데이터 HTTP 429: 호출 한도 초과, 재시도 중단":
            return True
        exc = exc.__cause__ or exc.__context__
    return False


# fetch 통신 오류만 같은 클라이언트·총예산으로 한 번 재시도하고 시도별 결과를 남긴다.
def run_stage(
    name: str,
    record: dict[str, Any],
    dry: bool,
    client: stages.VisitorClient | None,
    files: list[Path],
    baseline: tuple[Any, str | None] = (None, None),
) -> dict[str, Any]:
    if name == "publish":
        return publish_gate(record, dry)
    if missing := stages.missing_entrypoint(name):
        return {"passed": None, "message": f"진입점 없음: {missing}; skipped"}
    messages = []
    history = run_record.fetch_history() if name == "fetch" and not dry else {}
    if history:
        history["latest"] = max(filter(None, [history["latest"], stages.latest_observation()]), default=None)
    attempts = 2 if name == "fetch" and not dry else 1
    for attempt in range(attempts):
        retryable = False
        try:
            gate = (
                stages.inspect_stage(name, korea_today())
                if dry
                else stages.execute_stage(name, korea_today(), client, files, history, baseline)
            )
        except Exception as exc:
            gate = {"passed": False, "message": f"{type(exc).__name__}: {safe_error(exc)}"}
            retryable = transient_error(exc)
        # 일부 수집 뒤 통신 오류가 겹쳐도 관측일 감소가 있으면 데이터 이상을 우선한다.
        if history and client is not None and client.collected_rows:
            latest = stages.latest_observation()
            if history["latest"] and (latest is None or latest < history["latest"]):
                gate = {
                    "passed": False,
                    "message": f"최신 관측일 감소: {history['latest']} → {latest}; 재시도 없음",
                }
                retryable = False
        messages.append((f"시도 {attempt + 1}: " if attempts > 1 else "") + gate["message"])
        if gate["passed"] is not False or not retryable:
            break
    # 계약의 게이트 메시지에 수집 상태를 보관해 dry나 캐시 실행이 성공 시각을 갱신하지 않게 한다.
    if history and client is not None:
        history["latest"] = max(filter(None, [history["latest"], stages.latest_observation()]), default=None)
        history["last_success"] = client.last_success or history["last_success"]
        messages.append(
            f"{'새 관측 수집' if client.collected_rows else '캐시만'}; 수집 {client.collected_rows}행; "
            f"이번 실행 외부 호출={client.ledger.calls}; "
            f"마지막 수집 성공 시각={history['last_success'] or '미기록'}"
        )
        messages[-1] += run_record.FETCH_STATE_MARKER + json.dumps(history, ensure_ascii=False)
    return {"passed": gate["passed"], "message": " | ".join(messages)}


# 악화 없는 백테스트 후보를 승격하고, 승격이 실패하면 사용 모델을 그대로 둔 채 단계를 실패로 바꾼다.
def promote_candidate(stage: dict[str, Any], gate: dict[str, Any], files: list[Path]) -> None:
    verdict = "통과" if gate["passed"] else "미검증"
    try:
        stages.promote(next(path for path in files if path.name == "backtest.json"), verdict)
    except Exception as exc:
        gate["passed"], stage["status"] = False, "failed"
        gate["message"] += f"; 사용 모델 승격 실패: {type(exc).__name__}: {safe_error(exc)}"
        return
    gate["message"] += f"; 사용 모델로 승격({verdict})"


# 인자·범위를 먼저 검증해 잘못된 요청은 기록과 산출물을 만들지 않는다.
def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--from", dest="first", choices=stages.STAGES, default="fetch")
    parser.add_argument("--to", dest="last", choices=stages.STAGES, default="publish")
    parser.add_argument(
        "--dry", action="store_true", help="단계 실행 없이 입력·게이트를 검사하고 dry 기록만 저장"
    )
    parser.add_argument("--max-calls", type=int, default=0, help="재시도를 포함한 방문자 외부 호출 총예산")
    commands = parser.add_subparsers(dest="command")
    summarize = commands.add_parser("summary", help="완료된 실행 기록에 요약을 채운다")
    summarize.add_argument("run_id")
    args = parser.parse_args(argv)
    if args.command == "summary":
        try:
            return 0 if summary.summarize_run(args.run_id) else 1
        except (OSError, ValueError, ValidationError):
            print("실행 기록을 요약할 수 없습니다: 식별자·기록·완료 상태를 확인하세요")
            return 1
    if args.max_calls < 0:
        parser.error("--max-calls는 0 이상이어야 합니다")
    try:
        selected = stages.select_stages(args.first, args.last)
    except ValueError as exc:
        parser.error(str(exc))
    record = run_record.new_record(stages.STAGES, selected, args.dry)
    run_record.write_record(record)

    # 각 상태 전이도 저장해 긴 실행 도중 운영 화면에서 진행 상황을 읽을 수 있게 한다.
    # 백테스트 비교 기준은 실행 시작 때의 사용 모델 결과로 고정한다(train이 후보를 먼저 발행해도 그대로).
    baseline = gates.promoted_result()
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
                    client = stack.enter_context(stages.VisitorClient(max_calls=args.max_calls))
                files: list[Path] = []
                gate = run_stage(name, record, args.dry, client, files, baseline)
                # dry와 미실행 단계에는 기존 파일을 새 산출물처럼 기록하지 않는다.
                if not args.dry:
                    if name == "fetch":
                        files = stages.output_files(name)
                    stage["artifacts"] = run_record.artifacts(files)
            except Exception as exc:
                gate = {"passed": False, "message": f"{type(exc).__name__}: {safe_error(exc)}"}
            stage["gate"] = gate
            stage["status"] = (
                "skipped" if gate["passed"] is None else ("passed" if gate["passed"] else "failed")
            )
            stage["ms"] = (perf_counter_ns() - started) // 1_000_000
            run_record.write_record(record)
            # 산출물 기록을 저장한 뒤에만 악화 없는 후보를 사용 모델로 승격한다(실패하면 단계 실패).
            if name == "backtest" and stage["status"] != "failed" and stage.get("artifacts") and not args.dry:
                promote_candidate(stage, gate, files)
                run_record.write_record(record)
            print(f"{name}: {stage['status']} — {gate['message']}", flush=True)
            if stage["status"] == "failed":
                break

    # 실패 뒤 선택 단계는 초기 pending 상태 그대로 두고 종료 코드를 명확하게 전달한다.
    code = run_record.finish_record(record, args.dry, selected)
    path = run_record.write_record(record)
    summary.save_summary(record, use_ollama=not args.dry)
    print(f"{record['summary']}\n{path}")
    return code


# python -m crowdcast.pipeline 호출에서 파이프라인 종료 코드를 셸에 전달한다.
if __name__ == "__main__":
    raise SystemExit(main())
