"""동일 실행의 요약·예보를 검증하고 공개 조건과 해시 순서로 등록 대상을 고른다."""

import json
from collections import Counter
from dataclasses import dataclass
from datetime import timedelta
from hashlib import sha256
from typing import Any

import holidays
import polars as pl
from crowdcast import paths
from crowdcast.analytics.upcoming import SUMMARY_SCHEMA, festival_summary
from crowdcast.api.assemble.identity import identifier
from crowdcast.api.contract import validate
from crowdcast.data.crosswalk import INCHEON_BREAK_CODES
from crowdcast.data.events import contract_event
from crowdcast.labels.silver import daily_index
from crowdcast.scoring import rules


# 한 번 읽은 바이트의 해시와 전체 예보를 선정·등록에 함께 넘긴다.
@dataclass(frozen=True)
class Batch:
    summaries: list[dict[str, Any]]
    forecasts: dict[str, dict[str, Any]]
    metadata: dict[str, Any]


# 비어 있는 JSONL도 행 수·ID 집합 대조를 생략하지 않는다.
def load_batch() -> Batch:
    parquet = (paths.PROCESSED / "upcoming.parquet").read_bytes()
    raw = (paths.PROCESSED / "upcoming_forecasts.jsonl").read_bytes()
    frame = pl.read_parquet(parquet)
    run_id = pl.read_parquet_metadata(parquet)["runId"]
    records = [json.loads(line) for line in raw.splitlines()]
    if not run_id or frame["runId"].null_count() or set(frame["runId"]) - {run_id}:
        raise ValueError("parquet runId 불일치")
    if any(row["runId"] != run_id for row in records):
        raise ValueError("parquet·JSONL runId 불일치")
    forecasts = {row["forecast"]["id"]: row["forecast"] for row in records}
    if (frame.height != len(records) or len(forecasts) != len(records)
            or frame["forecastId"].n_unique() != frame.height
            or set(frame["forecastId"]) != set(forecasts)
            or frame["eventId"].n_unique() != frame.height):
        raise ValueError("parquet·JSONL 행 수 또는 forecastId 집합·중복 불일치")

    # 정수 인원과 요약의 주요 필드까지 검사해 오래된 T-204 산출물을 받지 않는다.
    metadata = rules.model_metadata()
    for row in frame.to_dicts():
        forecast = forecasts[row["forecastId"]]
        validate("forecast", forecast)
        summary = {key: row[key] for key in SUMMARY_SCHEMA}
        validate("festival-summary", summary)
        if (forecast["eventId"] != row["eventId"]
                or forecast["modelVersion"] != row["modelVersion"]
                or row["modelVersion"] != metadata["modelVersion"]
                or row["modelVerdict"] != metadata["verdict"]
                or forecast["predictionRun"]["modelVersion"] != metadata["modelVersion"]
                or forecast["predictionRun"]["modelVerdict"] != metadata["verdict"]
                or forecast["judgment"]["level"] != row["level"]):
            raise ValueError("요약·예보·사용 모델 불일치")
        if rules.local_date(forecast["asOf"]) > rules.local_date(row["startsAt"]) - timedelta(days=14):
            raise ValueError("외부 피처 기준일이 개최 D-14 뒤입니다")
        for quantity in ("dailyMean", "peakConcurrent"):
            values = [forecast[quantity][f"p{q}"] for q in (10, 50, 90)]
            if any(type(value) is not int or value < 0 for value in values) or values != sorted(values):
                raise ValueError("T-204b 이후 정수·비음수·순서 보장 인원 예보가 필요합니다")
        if any(row[f"peakP{q}"] != forecast["peakConcurrent"][f"p{q}"] for q in (10, 50, 90)):
            raise ValueError("요약·예보 순간 최대 불일치")
        probability = next(p["probability"] for p in forecast["probabilities"] if p["threshold"] == 1000)
        if probability != row["pOver1000"] or forecast["ood"] != row["ood"]:
            raise ValueError("요약·예보 확률 또는 OOD 불일치")
    metadata.update(runId=run_id, forecastsSha256=sha256(raw).hexdigest(),
                    summariesSha256=sha256(parquet).hexdigest())
    return Batch(frame.to_dicts(), forecasts, metadata)


# SHA-256의 입력에는 구분자나 현지 시각을 덧붙이지 않는다.
def selection_key(row: dict[str, Any]) -> tuple[str, str]:
    event_id = row["eventId"]
    return sha256((event_id + rules.REGISTRATION_DATE.isoformat()).encode()).hexdigest(), event_id


# 공개된 평시 근거의 날짜 범위를 고정하고 다른 지역·등록 뒤 자료는 인정하지 않는다.
def baseline_period(forecast: dict[str, Any], code: str) -> dict[str, str] | None:
    for fragment in forecast["evidence"]:
        if fragment["kind"] != "data" or fragment["title"] != "개최지 평시 방문":
            continue
        available = fragment.get("availableAt")
        if not available or rules.local_date(available) > rules.REGISTRATION_DATE:
            continue
        summary = json.loads(fragment["summary"])
        if summary.get("sigunguCode") == code:
            return fragment["period"]
    return None


# T-103과 같은 완전한 하루·공휴일 제외·필요 요일별 최소 표본을 확인한다.
def baseline_ready(row: dict[str, Any], forecast: dict[str, Any], index: dict[str, Any]) -> bool:
    period = baseline_period(forecast, row["sigunguCode"])
    if period is None:
        return False
    first, last = (rules.local_date(period[key]) for key in ("from", "to"))
    if not 1 <= (last - first).days + 1 <= rules.BASELINE_WINDOW or last >= rules.REGISTRATION_DATE:
        return False
    calendar = holidays.KR(years=range(first.year, last.year + 1), language="ko")
    observations = index.get(row["sigunguCode"], {})
    samples = Counter(day.weekday() for day, value in observations.items()
                      if first <= day <= last and day not in calendar
                      and value["complete"] and not value["continuity_break"])
    start, end = (rules.local_date(row[key]) for key in ("startsAt", "endsAt"))
    needed = {(start + timedelta(days=n)).weekday() for n in range((end - start).days + 1)}
    return all(samples[weekday] >= rules.MIN_BASELINE_DAYS for weekday in needed)


# 서로 겹치는 조건은 공개된 순서의 첫 제외 사유로만 센다.
def exclusion(row: dict[str, Any], event: dict[str, Any], forecast: dict[str, Any],
              index: dict[str, Any]) -> str | None:
    start, end = (rules.local_date(row[key]) for key in ("startsAt", "endsAt"))
    if start < rules.REGISTRATION_DATE + timedelta(days=rules.MIN_LEAD_DAYS):
        return "리드타임 3일 미만"
    if end > rules.LAST_END:
        return "종료일 2026-10-31 이후"
    if not row["sigunguCode"] or event.get("sigungu_match") in {"none", "ambiguous"}:
        return "시군구 미확정"
    if row["sigunguCode"] in INCHEON_BREAK_CODES or event.get("continuity_break"):
        return "연속성 끊김(인천 개편 포함)"
    period = baseline_period(forecast, row["sigunguCode"])
    if period and any(value["continuity_break"] for day, value in index.get(row["sigunguCode"], {}).items()
                      if rules.local_date(period["from"]) <= day <= rules.local_date(period["to"])):
        return "연속성 끊김(인천 개편 포함)"
    if row.get("date_available_at") and rules.local_date(row["date_available_at"]) > rules.REGISTRATION_DATE:
        return "등록일 뒤 공개된 일정"
    if not 1 <= (end - start).days + 1 <= rules.MAX_DURATION:
        return "기간 범위 밖(1~14일)"
    if not baseline_ready(row, forecast, index):
        return "공개 평시 같은 요일 기준선 3일 미만"
    return None


# 대상 전체를 먼저 판정한 뒤 등급층과 전체 보충의 순서를 고정한다.
def select_festivals(batch: Batch, events: list[dict[str, Any]], region_daily: pl.DataFrame
                     ) -> dict[str, Any]:
    master = {event["event_id"]: event for event in events}
    if len(master) != len(events):
        raise ValueError("행사 마스터 event_id 중복")
    periods = [period for row in batch.summaries
               if (period := baseline_period(batch.forecasts[row["forecastId"]], row["sigunguCode"]))]
    first = min((rules.local_date(p["from"]) for p in periods), default=rules.REGISTRATION_DATE)
    last = max((rules.local_date(p["to"]) for p in periods), default=rules.REGISTRATION_DATE)
    public = region_daily.filter(pl.col("date").is_between(first, last)
                                 & (pl.col("available_at") <= rules.REGISTRATION_DATE))
    index = daily_index(public)
    eligible, excluded, snapshots, notes = [], [], {}, Counter()
    for row in sorted(batch.summaries, key=selection_key):
        event, forecast = master[row["eventId"]], batch.forecasts[row["forecastId"]]
        # 제외 여부와 무관하게 예보 당시의 전체 행사 조건이 유지됐는지 확인한다.
        snapshot = contract_event(event)
        forecast_id = identifier("f", {"eventId": snapshot["id"], "asOf": forecast["asOf"],
                                       "modelVersion": forecast["modelVersion"], "event": snapshot})
        if forecast_id != forecast["id"]:
            raise ValueError("T-205 뒤 행사 마스터가 바뀜 — 일괄 예보를 다시 돌리세요")

        # 검증한 스냅샷만 선정·등록에 넘기고 요약 필드 일치도 함께 보장한다.
        if not row.get("date_available_at"):
            notes[rules.UNPROVEN_DATE] += 1
        if reason := exclusion(row, event, forecast, index):
            excluded.append({"eventId": row["eventId"], "reason": reason})
            continue
        if festival_summary(snapshot, forecast) != {key: row[key] for key in SUMMARY_SCHEMA}:
            raise ValueError("행사 마스터가 T-205 요약과 다릅니다 — 배치 재생성 필요")
        eligible.append(row)
        snapshots[row["eventId"]] = snapshot

    # 8건 상한은 층화 단계에만 적용하고 부족분은 모든 층의 잔여 후보로 채운다.
    selected = [row for level in rules.LEVELS
                for row in [r for r in eligible if r["level"] == level][:rules.PER_LEVEL]]
    stratified = len(selected)
    chosen = {row["eventId"] for row in selected}
    selected += [row for row in eligible if row["eventId"] not in chosen][
        :max(0, rules.MIN_TOTAL - len(selected))]
    counts = {str(level): sum(row["level"] == level for row in selected) for level in rules.LEVELS}
    audit = {
        "input": len(batch.summaries), "eligible": len(eligible), "selected": len(selected),
        "stratified": stratified, "filled": len(selected) - stratified, "levelCounts": counts,
        "excludedCounts": dict(sorted(Counter(row["reason"] for row in excluded).items())),
        "excluded": excluded, "notes": dict(notes),
        "imbalance": ", ".join(f"{level}등급 {count}건" for level, count in counts.items()),
        "shortfallReason": (f"선정 조건 충족 {len(eligible)}건으로 최소 {rules.MIN_TOTAL}건 미달"
                            if len(selected) < rules.MIN_TOTAL else "없음"),
    }
    keys = [*SUMMARY_SCHEMA, "modelVerdict"]
    return {"summaries": [{key: row[key] for key in keys} for row in selected], "audit": audit,
            "events": {row["eventId"]: snapshots[row["eventId"]] for row in selected}}


# 서비스와 CLI가 동일한 입력 파일·선정 함수를 사용한다.
def load_selection() -> tuple[Batch, dict[str, Any]]:
    batch = load_batch()
    events_raw = (paths.PROCESSED / "events.parquet").read_bytes()
    region_raw = (paths.PROCESSED / "region_daily.parquet").read_bytes()
    batch.metadata.update(eventsSha256=sha256(events_raw).hexdigest(),
                          regionSha256=sha256(region_raw).hexdigest())
    selection = select_festivals(batch, pl.read_parquet(events_raw).to_dicts(), pl.read_parquet(region_raw))
    return batch, selection
