"""실행 시점의 입력 해시와 표 행 수를 상대 경로로 기록한다."""

import csv
from pathlib import Path
from typing import Any

import polars as pl
from crowdcast.pipeline import run_record


# 표의 행 수만 실측하고 비표 형식이나 읽지 못한 파일은 미측정으로 남긴다.
def row_count(path: Path) -> int | None:
    try:
        if path.suffix == ".parquet":
            return pl.scan_parquet(path).select(pl.len()).collect().item()
        if path.suffix == ".csv":
            with path.open(encoding="utf-8-sig", newline="") as stream:
                return max(0, sum(1 for _ in csv.reader(stream)) - 1)
        if path.suffix == ".jsonl":
            with path.open(encoding="utf-8") as stream:
                return sum(1 for line in stream if line.strip())
    except (OSError, UnicodeError, csv.Error, pl.exceptions.PolarsError):
        return None
    return None


# 없는 입력도 기록하고 실행 뒤 바뀐 파일을 입력 시점의 해시로 잘못 연결하지 않는다.
def input_snapshot(files: list[Path]) -> list[dict[str, Any]]:
    return sorted(
        (
            {
                "path": run_record.artifact_path(path),
                "sha256": run_record.sha256(path) if path.is_file() else None,
            }
            for path in set(files)
        ),
        key=lambda item: item["path"],
    )


# 기존 run_record가 확정한 출력 해시를 유지하고 같은 파일의 행 수만 덧붙인다.
def output_snapshot(artifacts: list[dict[str, str]], files: list[Path]) -> list[dict[str, Any]]:
    counts = {run_record.artifact_path(path): row_count(path) for path in set(files)}
    return [{**item, "rows": counts.get(item["path"])} for item in artifacts]
