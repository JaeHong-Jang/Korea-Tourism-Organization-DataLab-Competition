"""고정된 단계 순서와 기존 모듈 진입점을 연결하고 실행 입력·산출물을 찾는다."""

import importlib.util
import json
import subprocess
import sys
from datetime import date, timedelta
from pathlib import Path
from tempfile import TemporaryDirectory
from time import time_ns
from typing import Any

import polars as pl
from crowdcast import paths
from crowdcast.data.call_ledger import KST, CallLimitReached, atomic_write
from crowdcast.data.datago_client import ApiPage, DataGoClient, safe_error
from crowdcast.data.visitors import VISITORS_LAG_DAYS, IncompleteVisitors, collect_visitors
from crowdcast.pipeline import gates, run_record

# 콜론 뒤는 python -m 모듈에 넘길 하위 명령이며 T-203·T-205는 이 표의 진입점을 제공한다.
ENTRYPOINTS = {
    "fetch": ("crowdcast.data.visitors", "crowdcast.data.events"),
    "labels": ("crowdcast.labels",),
    "features": ("crowdcast.models:features",),
    "train": ("crowdcast.models:train",),
    "backtest": ("crowdcast.models:backtest",),
    "batch": ("crowdcast.analytics.upcoming",),
    "publish": (),
}
STAGES = tuple(ENTRYPOINTS)
OUTPUTS = {
    "fetch": (
        "region_daily.parquet",
        "region_daily.progress.json",
        "events.parquet",
        "events_qc.md",
        "admin_dict.parquet",
    ),
    "labels": ("labels.parquet", "labels_g0.json", "labels_qc.md", "diy_labels_template.csv"),
    "features": ("features.parquet", "features_availability.json"),
    "batch": ("upcoming.parquet", "upcoming_forecasts.jsonl", "upcoming_qc.md"),
}
# 후속 단계는 이 필수 산출물 전부를 갱신해야 하며 학습·백테스트는 불변 발행이라 완료 포인터로 식별한다.
POINTER_STAGES = ("train", "backtest")
BACKTEST_FILES = ("backtest.json", "backtest.md", "points.parquet")
REQUIRED_OUTPUTS = {
    "features": ("data/processed/features_availability.json", "data/processed/features.parquet"),
    "train": ("reports/backtest/latest.json",),
    "backtest": ("reports/backtest/latest.json",),
    "batch": ("data/processed/upcoming.parquet",),
}


# 기존 수집기를 그대로 호출하며 실제 전송으로 받은 관측과 성공 시각만 추적한다.
class VisitorClient(DataGoClient):
    collected_rows = 0
    last_success: str | None = None

    # 캐시 재사용과 실패한 호출을 새 수집 성공으로 기록하지 않는다.
    def page(self, *args: Any, **kwargs: Any) -> ApiPage:
        before = self.ledger.calls
        page = super().page(*args, **kwargs)
        if self.ledger.calls > before and page.items:
            self.collected_rows += len(page.items)
            self.last_success = page.fetched_at.astimezone(KST).isoformat()
        return page


# 범위를 역순으로 지정하면 아무 작업도 시작하지 않는다.
def select_stages(first: str, last: str) -> tuple[str, ...]:
    start, end = STAGES.index(first), STAGES.index(last)
    if start > end:
        raise ValueError("--from은 --to보다 뒤일 수 없습니다")
    return STAGES[start : end + 1]


# 대상 모듈 부재만 건너뛰고 설치된 모듈의 의존성 오류는 실패로 드러낸다.
def missing_entrypoint(stage: str) -> str | None:
    if stage not in {"fetch", "labels", "publish"} and stage not in REQUIRED_OUTPUTS:
        return f"{stage} 필수 산출물 표 없음"
    for entry in ENTRYPOINTS[stage]:
        module = entry.partition(":")[0]
        try:
            found = importlib.util.find_spec(module)
        except ModuleNotFoundError as exc:
            if exc.name and (module == exc.name or module.startswith(exc.name + ".")):
                return entry
            raise
        if found is None:
            return entry
    return None


# dry 검사에는 실행 모듈을 부르지 않고 이미 있는 필수 입력 경로만 사용한다.
def input_files(stage: str) -> list[Path]:
    names = {
        "fetch": ("region_daily.parquet", "mcst_festivals.parquet"),
        "labels": ("events.parquet", "region_daily.parquet", "diy_targets.csv"),
        "features": ("events.parquet", "region_daily.parquet", "labels.parquet"),
        "train": ("labels.parquet",),
        "backtest": ("labels.parquet", "events.parquet"),
        "batch": ("events.parquet",),
    }
    files = [paths.PROCESSED / name for name in names.get(stage, ())]
    if stage == "fetch":
        files.append(paths.EXTERNAL / "boundaries/sigungu.topo.json")
    if stage == "labels":
        files += [paths.PROCESSED / "labels_g0.json", paths.PROCESSED / "labels.parquet"]
    # 일괄 예보는 완료 포인터와 그 포인터가 가리키는 모델 카드가 모두 있어야 한다.
    if stage == "batch":
        files.append(paths.REPORTS / "backtest/latest.json")
        if (directory := run_record.model_directory()) is not None:
            files.append(directory / "model_card.json")
    return files


# 단계가 소유한 산출물만 해시 대상으로 모아 다른 레인의 파일을 섞지 않는다.
def output_files(stage: str, backtest_directory: Path | None = None) -> list[Path]:
    files = [paths.PROCESSED / name for name in OUTPUTS.get(stage, ())]
    if stage == "train":
        files = run_record.model_files()
    if stage == "backtest":
        files = [] if backtest_directory is None else [backtest_directory / name for name in BACKTEST_FILES]
    return [path for path in files if path.is_file()]


# 기존 CLI의 출력은 캡처하고 키를 제거해 실패 기록에 필요한 부분만 넘긴다.
def command(entry: str, args: list[str] | None = None) -> tuple[int, str]:
    module, _, subcommand = entry.partition(":")
    result = subprocess.run(
        [sys.executable, "-m", module, *([subcommand] if subcommand else []), *(args or [])],
        stdin=subprocess.DEVNULL,
        capture_output=True,
        text=True,
        check=False,
    )
    detail = safe_error(RuntimeError(result.stdout + "\n" + result.stderr)).strip().replace("\n", " ")
    return result.returncode, detail


# 기존 행사·라벨에 표시된 골든 ID를 재실행 시에도 CLI에 넘겨 학습 제외를 보존한다.
def golden_command(entry: str, args: list[str]) -> tuple[int, str]:
    golden: set[str] = set()
    for name in ("events.parquet", "labels.parquet"):
        path = paths.PROCESSED / name
        if path.exists():
            frame = pl.scan_parquet(path)
            golden.update(frame.filter(pl.col("is_golden")).select("event_id").collect()["event_id"])
    if not golden:
        return command(entry, args)
    with TemporaryDirectory(prefix="crowdcast-golden-") as directory:
        path = Path(directory) / "golden.json"
        path.write_text(json.dumps(sorted(golden)), encoding="utf-8")
        return command(entry, [*args, "--golden-file", str(path)])


# 보유 자료의 첫날부터 공개 지연을 지난 날까지 기존 체크포인트로 재개한다.
def fetch_range(today: date) -> tuple[date, date]:
    end = today - timedelta(days=VISITORS_LAG_DAYS)
    path = paths.PROCESSED / "region_daily.parquet"
    start = end.replace(day=1)
    if path.exists():
        first, latest = (
            pl.scan_parquet(path)
            .select(pl.col("date").min().alias("first"), pl.col("date").max().alias("latest"))
            .collect()
            .row(0)
        )
        if first is not None:
            start, end = first, max(latest, end)
    return start, end


# 수집 전후 최신 관측일을 읽어 직전 실행 이후의 날짜 감소를 감시한다.
def latest_observation() -> str | None:
    path = paths.PROCESSED / "region_daily.parquet"
    if not path.is_file():
        return None
    latest = pl.scan_parquet(path).select(pl.col("date").max()).collect().item()
    return latest.isoformat() if latest else None


# 예산·미공개 중단은 확보 자료 게이트로 판단하되 실제 수집 오류는 실패로 전파한다.
def fetch(client: VisitorClient, today: date, history: dict[str, str | None]) -> dict[str, Any]:
    codes = gates.visitor_codes()
    start, end = fetch_range(today)
    note = f"방문자 계획 {start}~{end}"
    try:
        collect_visitors(client, start, end, output=paths.PROCESSED / "region_daily.parquet")
    except (CallLimitReached, IncompleteVisitors) as exc:
        note += "; 수집 일시정지: " + safe_error(exc)
    latest = (
        pl.scan_parquet(paths.PROCESSED / "region_daily.parquet")
        .select(pl.col("date").max())
        .collect()
        .item()
    )
    if (
        client.collected_rows
        and history["latest"]
        and (latest is None or latest < date.fromisoformat(history["latest"]))
    ):
        return {"passed": False, "message": f"최신 관측일 감소: {history['latest']} → {latest}; 재시도 없음"}
    gate = gates.fetch_gate(today, start, codes)
    if not gate["passed"]:
        return gate
    code, detail = golden_command(ENTRYPOINTS["fetch"][1], ["--offline"])
    if code != 0:
        return {"passed": False, "message": f"events 종료 코드 {code}: {detail}"}
    gate["message"] += f"; {note}; 이번 실행 외부 호출={client.ledger.calls}; events --offline 종료 코드 0"
    return gate


# dry에서는 단계 코드를 실행하지 않고 입력 존재·저장 게이트만 검사한다.
def inspect_stage(stage: str, today: date) -> dict[str, Any]:
    files = input_files(stage)
    missing = [str(path.name) for path in files if not path.is_file()]
    if missing:
        return {"passed": False, "message": "dry 입력 없음: " + ", ".join(missing)}
    if stage == "fetch":
        start, end = fetch_range(today)
        gate = gates.fetch_gate(today, start)
        gate["message"] += f"; 방문자 계획 {start}~{end}; events --offline"
    elif stage == "labels":
        gate = gates.labels_gate()
    elif stage == "features":
        gate = gates.optional_gate(stage, [], None)
    else:
        return {
            "passed": None,
            "message": "dry 입력 확인; 실행 게이트는 미판정: " + ", ".join(p.name for p in files),
        }
    gate["message"] = "dry 저장 입력 검사 (단계 미실행): " + gate["message"]
    return gate


# 일괄 예보가 쓸 모델: 완료 포인터가 있고, 그 버전 폴더의 카드 버전이 포인터와 같아야 한다.
def batch_model_problem() -> str | None:
    directory = run_record.model_directory()
    if directory is None:
        return "일괄 예보 입력 없음: reports/backtest/latest.json"
    card = directory / "model_card.json"
    if not card.is_file():
        return f"일괄 예보 입력 없음: models/{directory.name}/model_card.json"
    if json.loads(card.read_bytes())["modelVersion"] != directory.name:
        return "모델 카드 버전과 완료 포인터의 modelVersion 불일치"
    return None


# 거부된 학습·백테스트 결과를 가리키는 완료 포인터를 실행 시작 때의 바이트로 되돌린다(처음이면 지운다).
def restore_pointer(previous: bytes | None) -> str:
    pointer = paths.REPORTS / "backtest/latest.json"
    if previous is None:
        pointer.unlink(missing_ok=True)
    else:
        atomic_write(pointer, previous)
    return "; 완료 포인터를 실행 시작 때 결과로 되돌림"


# 기존 모듈 종료 코드가 실패면 과거 성공 산출물이 있어도 게이트를 통과시키지 않는다.
def execute_stage(
    stage: str,
    today: date,
    client: VisitorClient | None,
    files: list[Path],
    history: dict[str, str | None],
    baseline: Any = None,
) -> dict[str, Any]:
    if stage == "fetch":
        if client is None:
            raise ValueError("fetch 호출 예산이 초기화되지 않았습니다")
        return fetch(client, today, history)
    # 일괄 예보는 dry와 같게 실제 실행 전에도 완료 포인터와 그 버전의 모델 카드를 확인한다.
    if stage == "batch" and (problem := batch_model_problem()):
        return {"passed": False, "message": problem}
    # train이 먼저 새 결과를 발행하므로 백테스트 비교 기준은 파이프라인 시작 때 읽은 결과를 쓴다.
    previous = baseline if stage == "backtest" else gates.previous_result(stage)
    # 백테스트 완료 표식의 실행 전 내용 — 실행 뒤 내용이 바뀌어야 이번 결과로 인정한다.
    pointer = paths.REPORTS / "backtest/latest.json"
    pointer_before = pointer.read_bytes() if stage in POINTER_STAGES and pointer.is_file() else None
    started_ns = time_ns()
    code, detail = (
        golden_command(ENTRYPOINTS[stage][0], []) if stage == "labels" else command(ENTRYPOINTS[stage][0])
    )
    if code != 0:
        return {"passed": False, "message": f"{stage} 종료 코드 {code}: {detail}"}
    # 완료 표식은 같은 runId 재실행을 허용하고 나머지 단계는 필수 파일의 갱신을 확인한다.
    if stage in POINTER_STAGES:
        latest = pointer
        # 완료 표식 내용이 실행 전과 달라야 한다(같은 runId 재실행도 finishedAt이 새로 쓰여 내용이 바뀐다).
        if not latest.is_file() or latest.read_bytes() == pointer_before:
            message = f"이번 {stage} 실행이 latest.json을 갱신하지 않았습니다; 종료 코드 0"
            return {"passed": False, "message": message}
        backtest_directory = run_record.current_backtest(started_ns)
        missing = [name for name in BACKTEST_FILES if not (backtest_directory / name).is_file()]
        if missing:
            return {"passed": False, "message": f"이번 백테스트 산출물 없음: {', '.join(missing)}"}
        files.extend(output_files(stage, backtest_directory))
        files.append(latest)
    elif stage in REQUIRED_OUTPUTS:
        required = run_record.current_outputs(REQUIRED_OUTPUTS[stage], started_ns)
        files.extend(
            sorted(
                set(
                    required + [path for path in output_files(stage) if path.stat().st_mtime_ns >= started_ns]
                )
            )
        )
    else:
        files.extend(output_files(stage))
    gate = gates.labels_gate() if stage == "labels" else gates.optional_gate(stage, files, previous)
    gate["message"] += "; 종료 코드 0"
    return gate
