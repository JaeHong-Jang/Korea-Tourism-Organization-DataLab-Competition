"""고정된 단계 순서와 기존 모듈 진입점을 연결하고 실행 입력·산출물을 찾는다."""

import importlib.util
import json
import subprocess
import sys
from datetime import date, timedelta
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any

import polars as pl
from crowdcast import paths
from crowdcast.data.call_ledger import CallLimitReached
from crowdcast.data.datago_client import DataGoClient, safe_error
from crowdcast.data.visitors import VISITORS_LAG_DAYS, IncompleteVisitors, collect_visitors
from crowdcast.pipeline import gates

# 콜론 뒤는 python -m 모듈에 넘길 하위 명령이며 T-203·T-205는 이 표의 진입점을 제공한다.
ENTRYPOINTS = {
    "fetch": ("crowdcast.data.visitors", "crowdcast.data.events"),
    "labels": ("crowdcast.labels",),
    "features": ("crowdcast.features.build",),
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
    "features": ("features.parquet",),
    "batch": ("upcoming.parquet", "upcoming_forecasts.jsonl", "upcoming_qc.md"),
}


# 범위를 역순으로 지정하면 아무 작업도 시작하지 않는다.
def select_stages(first: str, last: str) -> tuple[str, ...]:
    start, end = STAGES.index(first), STAGES.index(last)
    if start > end:
        raise ValueError("--from은 --to보다 뒤일 수 없습니다")
    return STAGES[start : end + 1]


# 대상 모듈 부재만 건너뛰고 설치된 모듈의 의존성 오류는 실패로 드러낸다.
def missing_entrypoint(stage: str) -> str | None:
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
    if stage == "batch":
        files.append(paths.MODELS / "model_card.json")
    return files


# 단계가 소유한 산출물만 해시 대상으로 모아 다른 레인의 파일을 섞지 않는다.
def output_files(stage: str) -> list[Path]:
    files = [paths.PROCESSED / name for name in OUTPUTS.get(stage, ())]
    if stage == "train":
        card = paths.MODELS / "model_card.json"
        files = [card]
        if card.is_file():
            version = json.loads(card.read_bytes())["modelVersion"]
            if not version or Path(version).name != version or version.startswith("."):
                raise ValueError("모델 버전은 models/ 아래 디렉터리 이름이어야 합니다")
            directory = paths.MODELS / version
            files += [
                path
                for path in directory.rglob("*")
                if path.is_file()
                and not any(part.startswith(".") for part in path.relative_to(directory).parts)
            ]
    if stage == "backtest":
        summaries = list((paths.REPORTS / "backtest").glob("*/backtest.json"))
        if summaries:
            latest = max(summaries, key=lambda path: path.stat().st_mtime_ns)
            files = [latest, latest.with_name("backtest.md"), latest.with_name("points.parquet")]
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
        first = pl.scan_parquet(path).select(pl.col("date").min()).collect().item()
        if first is not None:
            start = min(first, start)
    return start, end


# 예산·미공개 중단은 확보 자료 게이트로 판단하되 실제 수집 오류는 실패로 전파한다.
def fetch(client: DataGoClient, today: date) -> dict[str, Any]:
    start, end = fetch_range(today)
    note = f"방문자 계획 {start}~{end}"
    try:
        collect_visitors(client, start, end, output=paths.PROCESSED / "region_daily.parquet")
    except (CallLimitReached, IncompleteVisitors) as exc:
        note += "; 수집 일시정지: " + safe_error(exc)
    code, detail = golden_command(ENTRYPOINTS["fetch"][1], ["--offline"])
    if code != 0:
        return {"passed": False, "message": f"events 종료 코드 {code}: {detail}"}
    gate = gates.fetch_gate(today)
    gate["message"] += f"; {note}; 이번 실행 외부 호출={client.ledger.calls}; events --offline 종료 코드 0"
    return gate


# dry에서는 단계 코드를 실행하지 않고 입력 존재·저장 게이트만 검사한다.
def inspect_stage(stage: str, today: date) -> dict[str, Any]:
    files = input_files(stage)
    missing = [str(path.name) for path in files if not path.is_file()]
    if missing:
        return {"passed": False, "message": "dry 입력 없음: " + ", ".join(missing)}
    if stage == "fetch":
        gate = gates.fetch_gate(today)
        start, end = fetch_range(today)
        gate["message"] += f"; 방문자 계획 {start}~{end}; events --offline"
    elif stage == "labels":
        gate = gates.labels_gate()
    else:
        return {
            "passed": None,
            "message": "dry 입력 확인; 실행 게이트는 미판정: " + ", ".join(p.name for p in files),
        }
    gate["message"] = "dry 저장 입력 검사 (단계 미실행): " + gate["message"]
    return gate


# 기존 모듈 종료 코드가 실패면 과거 성공 산출물이 있어도 게이트를 통과시키지 않는다.
def execute_stage(stage: str, today: date, client: DataGoClient | None) -> dict[str, Any]:
    if stage == "fetch":
        if client is None:
            raise ValueError("fetch 호출 예산이 초기화되지 않았습니다")
        return fetch(client, today)
    previous = gates.previous_result(stage)
    code, detail = (
        golden_command(ENTRYPOINTS[stage][0], []) if stage == "labels" else command(ENTRYPOINTS[stage][0])
    )
    if code != 0:
        return {"passed": False, "message": f"{stage} 종료 코드 {code}: {detail}"}
    gate = (
        gates.labels_gate()
        if stage == "labels"
        else gates.optional_gate(stage, output_files(stage), previous)
    )
    gate["message"] += "; 종료 코드 0"
    return gate
