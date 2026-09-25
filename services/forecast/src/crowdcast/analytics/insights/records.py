"""보유 표와 일괄 예보를 한 번 읽고 인사이트의 기간·출처 메타를 제공한다."""

import json
import math
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Any

import polars as pl
from crowdcast import paths
from crowdcast.data.call_ledger import KST

VISITORS = "ds-kto-visitors-15101972"
PLANS = "ds-mcst-festival-plans"
TOURAPI = "ds-kto-tourapi-15101578"
GOLD = {"goldA": "ds-datalab-festival-status", "goldB": "ds-datalab-diy"}


# 문자열·날짜 입력에서 날짜만 취하고 알 수 없는 시점은 추정하지 않는다.
def day(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


# 비유한 수와 음수를 집계에서 제외하되 실제 영 관측은 보존한다.
def number(value: Any) -> float | None:
    if value is None:
        return None
    result = float(value)
    return result if math.isfinite(result) and result >= 0 else None


# 표본이 없을 때의 기간은 입력 범위이며 입력도 없으면 계산일임을 본문에 명시한다.
def period(rows: list[dict[str, Any]], today: date) -> dict[str, str]:
    dates = [
        parsed
        for row in rows
        for key in ("start", "end", "start_date", "end_date", "date")
        if (parsed := day(row.get(key))) is not None
    ]
    return {"from": min(dates, default=today).isoformat(), "to": max(dates, default=today).isoformat()}


# 계산과 단위 테스트가 같은 입력 구조를 사용하며 네트워크 클라이언트는 갖지 않는다.
@dataclass
class Inputs:
    computed_at: str
    events: pl.DataFrame = field(default_factory=pl.DataFrame)
    labels: pl.DataFrame = field(default_factory=pl.DataFrame)
    plans: pl.DataFrame = field(default_factory=pl.DataFrame)
    region: pl.DataFrame = field(default_factory=pl.DataFrame)
    forecasts: list[dict[str, Any]] = field(default_factory=list)
    confirmed: dict[str, str] = field(default_factory=dict)
    collection_notes: dict[str, str] = field(default_factory=dict)

    # 계산 시점의 날짜를 메타데이터 없는 빈 결과의 명시적 기준으로 쓴다.
    @property
    def today(self) -> date:
        return date.fromisoformat(self.computed_at[:10])

    # 행사 ID 중복은 어느 행을 선택할지 추정하지 않고 오류로 드러낸다.
    def event_index(self) -> dict[str, dict[str, Any]]:
        rows = self.events.to_dicts()
        index = {row["event_id"]: row for row in rows}
        if len(index) != len(rows):
            raise ValueError("인사이트 행사 ID 중복")
        return index


# 원본 파일의 마지막 확인 시점을 찾고 수집일과 수정일 대용치를 구분한다.
def file_confirmation(path: Path, raw_files: list[str]) -> tuple[str, str]:
    originals = [paths.DATA / name for name in raw_files if name and (paths.DATA / name).is_file()]
    stamp = max(p.stat().st_mtime for p in originals or [path])
    return datetime.fromtimestamp(stamp, KST).date().isoformat(), (
        "원 수집일 미기록: 원본 파일 수정일 기준 확인"
        if originals
        else "원 수집일 미기록: 전처리 파일 수정일 기준 확인"
    )


# 파일 부재는 빈 표본이지만 깨진 파일·중복 예보는 실패로 처리한다.
def load() -> Inputs:
    result = Inputs(datetime.now(KST).isoformat())
    for attr, name in (
        ("events", "events"),
        ("labels", "labels"),
        ("plans", "mcst_festivals"),
        ("region", "region_daily"),
    ):
        path = paths.PROCESSED / f"{name}.parquet"
        if not path.is_file():
            continue
        frame = pl.read_parquet(path)
        setattr(result, attr, frame)
        originals = frame["source_file"].drop_nulls().unique().to_list() if "source_file" in frame else []
        result.confirmed[attr], result.collection_notes[attr] = file_confirmation(path, originals)

    # 일괄 예보의 완전한 저장 응답에서만 등급·인원·데이터셋 인용을 읽는다.
    path = paths.PROCESSED / "upcoming_forecasts.jsonl"
    if path.is_file():
        with path.open(encoding="utf-8") as stream:
            bundles = [json.loads(line) for line in stream if line.strip()]
        if len({row["runId"] for row in bundles}) > 1:
            raise ValueError("일괄 예보 실행 ID 혼합")
        result.forecasts = [row["forecast"] for row in bundles]
        if len({row["eventId"] for row in result.forecasts}) != len(result.forecasts):
            raise ValueError("일괄 예보 행사 ID 중복")
    result.event_index()
    return result
