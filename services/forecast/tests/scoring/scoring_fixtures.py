"""실제 한국 행사 이름과 합성 숫자로 사전 등록 입력·가짜 원장을 만든다."""

import json
from datetime import date, timedelta
from hashlib import sha256
from pathlib import Path
from typing import Any

import polars as pl
from crowdcast import paths
from crowdcast.analytics.upcoming import AUDIT_SCHEMA, SUMMARY_SCHEMA, festival_summary
from crowdcast.api.assemble.identity import canonical, identifier
from crowdcast.data.events import EVENT_DTYPES, contract_event
from crowdcast.scoring import rules
from crowdcast.scoring.register import ZERO_HASH, public_metadata, save_preparation
from crowdcast.scoring.select import Batch

FIXTURES = paths.REPO_ROOT / "packages/contracts/fixtures"


# 모든 방문자 구분을 포함해 표본 수와 순증을 손으로 검산할 수 있게 한다.
def daily_rows(values: dict[date, float], code: str = "41800") -> pl.DataFrame:
    return pl.DataFrame([
        {"sigungu_code": code, "date": day, "tou_div": category,
         "visitors": float(value if category == "현지인" else 0),
         "continuity_break": False, "available_at": day + timedelta(days=35)}
        for day, value in values.items() for category in ("현지인", "외지인", "외국인")
    ], schema={"sigungu_code": pl.String, "date": pl.Date, "tou_div": pl.String,
               "visitors": pl.Float64, "continuity_break": pl.Boolean, "available_at": pl.Date})


# 테스트 전용 메타는 실제 모델 파일이나 공유 경로를 읽지 않는다.
def model_metadata() -> dict[str, Any]:
    return {"modelVersion": "v0.1.0", "verdict": "미검증", "backtestRunId": "bt-prereg-test",
            "g0": {"primary_model": "simple", "basis": "구간"},
            "backtest": {"evaluated": 86, "covered": 49}, "promise": rules.PROMISE,
            "conversion": {"seed": 2026, "samples": 4000, "settings": rules.conversion_settings()}}


# 목록 길이만큼 합성 회차를 만들되 해시 정렬은 실제 행사 식별자 형태를 사용한다.
def inputs(levels: list[int]) -> tuple[Batch, list[dict[str, Any]], pl.DataFrame]:
    template = json.loads((FIXTURES / "forecast/valid-yeongjong.json").read_bytes())
    summaries, events, forecasts = [], [], {}
    for number, level in enumerate(levels):
        event_id = f"e-yeoncheon-yulmu-2026-{number:03d}"
        row = {**dict.fromkeys(EVENT_DTYPES), "event_id": event_id, "name": "연천율무축제",
               "type": "먹거리", "start": date(2026, 10, 9), "end": date(2026, 10, 9),
               "year": 2026, "sigungu_code": "41800", "sigungu_name": "연천군", "sido": "경기도",
               "sigungu_match": "exact", "continuity_break": False, "lat": 38.09, "lng": 127.07,
               "venue": "전곡리 유적", "fee": "무료", "host_type": "지자체", "time_of_day": "주간",
               "hazard_flags": [], "source": ["문체부"]}
        event = contract_event(row)
        forecast = json.loads(json.dumps(template))
        forecast.update(eventId=event_id, asOf="2026-09-25")
        forecast["id"] = identifier("f", {"eventId": event_id, "asOf": forecast["asOf"],
                                          "modelVersion": forecast["modelVersion"], "event": event})
        forecast["judgment"]["level"] = level
        forecast["predictionRun"].update(modelVerdict="미검증", modelVersion="v0.1.0")
        fragment = next(e for e in forecast["evidence"] if e["kind"] == "data")
        fragment.update(title="개최지 평시 방문", availableAt="2026-09-28",
                        period={"from": "2026-08-03", "to": "2026-08-24"},
                        summary=canonical({"sigunguCode": "41800"}))
        summary = {**festival_summary(event, forecast), "runId": "batch-prereg-test",
                   "modelVersion": "v0.1.0", "modelVerdict": "미검증", "date_source": "문체부",
                   "date_available_at": None, "baselineAvailable": True}
        summaries.append(summary)
        events.append(row)
        forecasts[forecast["id"]] = forecast
    metadata = {**model_metadata(), "runId": "batch-prereg-test", "forecastsSha256": "a" * 64,
                "summariesSha256": "b" * 64}
    values = {date(2026, 8, 3) + timedelta(days=n): 100 + n % 5 for n in range(22)}
    return Batch(summaries, forecasts, metadata), events, daily_rows(values)


# 읽기 경계 테스트를 위해 parquet 메타와 JSONL 래퍼를 실제 형식으로 쓴다.
def write_batch(directory: Path, batch: Batch, events: list[dict[str, Any]], region: pl.DataFrame) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    pl.from_dicts(batch.summaries, schema={**SUMMARY_SCHEMA, **AUDIT_SCHEMA}).write_parquet(
        directory / "upcoming.parquet", metadata={"runId": batch.metadata["runId"]})
    (directory / "upcoming_forecasts.jsonl").write_text(
        "".join(canonical({"runId": batch.metadata["runId"], "forecast": f}) + "\n"
                for f in batch.forecasts.values()), encoding="utf-8")
    pl.from_dicts(events, schema=EVENT_DTYPES).write_parquet(directory / "events.parquet")
    region.write_parquet(directory / "region_daily.parquet")


# records 정본과 같은 정렬 JSON으로 테스트 원장 응답을 생성한다.
def ledger(payloads: list[dict[str, Any]]) -> list[dict[str, Any]]:
    entries, previous = [], ZERO_HASH
    for seq, body in enumerate(payloads, 1):
        payload = {**body, "seq": seq, "registeredAt": "2026-09-29T09:00:00+09:00"}
        digest = sha256(canonical(payload).encode()).hexdigest()
        entry = {**payload, "payloadHash": digest, "prevHash": previous,
                 "hash": sha256((previous + digest).encode()).hexdigest()}
        entries.append(entry)
        previous = entry["hash"]
    return entries


# 실제 등록 없이 임시 폴더에 등록 완료 때의 고정 메타와 준비본을 구성한다.
def write_registered(preparation: dict[str, Any], region: pl.DataFrame) -> None:
    save_preparation(preparation)
    raw = (paths.PROCESSED / "prereg_payloads.json").read_bytes()
    public = rules.public_meta_path()
    public.parent.mkdir(parents=True, exist_ok=True)
    public.write_text(canonical(public_metadata(preparation, raw)) + "\n", encoding="utf-8")
    region.write_parquet(paths.PROCESSED / "region_daily.parquet")
