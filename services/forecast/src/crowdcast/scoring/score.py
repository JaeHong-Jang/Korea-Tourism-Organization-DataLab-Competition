"""고정 원장 예보를 T-103 실버와 같은 함수로 채점하고 네 상태를 공개한다."""

import json
from datetime import datetime, timedelta
from typing import Any

import httpx
import polars as pl
from crowdcast import paths
from crowdcast.api.assemble.identity import canonical, identifier
from crowdcast.api.contract import validate
from crowdcast.labels import silver
from crowdcast.models.distribution import distribution
from crowdcast.scoring import rules
from crowdcast.scoring.register import PAYLOAD_KEYS, RECORDS_URL, load_preparation, read_ledger, verify_ledger


# 출처와 시간대 있는 확인 시각을 갖춘 명시적 상태만 채점 제외에 사용한다.
def load_statuses() -> list[dict[str, str]]:
    file = paths.PROCESSED / "prereg_status.json"
    if not file.exists():
        return []
    rows = json.loads(file.read_bytes())
    if not isinstance(rows, list):
        raise ValueError("prereg_status.json은 상태 항목 배열이어야 합니다")
    seen = set()
    for row in rows:
        if (not isinstance(row, dict) or set(row) != {"eventId", "status", "source", "checkedAt"}
                or any(not isinstance(value, str) or not value.strip() for value in row.values())):
            raise ValueError("취소·연기 상태에는 eventId·status·source·checkedAt이 필요합니다")
        if row["status"] not in {"취소", "연기"} or row["eventId"] in seen:
            raise ValueError("취소·연기 상태 오류 또는 eventId 중복")
        instant = datetime.fromisoformat(row["checkedAt"])
        if instant.tzinfo is None:
            raise ValueError("취소·연기 checkedAt에는 시간대 있는 확인 시각이 필요합니다")
        seen.add(row["eventId"])
    return sorted(rows, key=lambda row: row["eventId"])


# frozen 행사 계약을 실버의 행사 입력으로 투영하고 기간·위험 정보를 재조회하지 않는다.
def silver_event(event: dict[str, Any]) -> dict[str, Any]:
    start, end = (rules.local_date(event[key]) for key in ("startsAt", "endsAt"))
    return {"event_id": event["id"], "name": event["name"], "type": event["type"],
            "start": start, "end": end, "year": start.year, "sido": event["sido"],
            "sigungu_code": event["sigunguCode"], "continuity_break": False}


# 같은 정의의 반올림 전 순증을 반환하고 T-103 품질 제외는 채점 불가로 보존한다.
def actual_status(event: dict[str, Any], region_daily: pl.DataFrame
                  ) -> tuple[str, dict[str, Any] | None]:
    input_event = silver_event(event)
    first = input_event["start"] - timedelta(days=rules.BASELINE_WINDOW)
    frame = region_daily.filter((pl.col("sigungu_code") == event["sigunguCode"])
                                & pl.col("date").is_between(first, input_event["end"]))
    labels, excluded = silver.build_silver([input_event], frame, "region_daily.parquet")
    if excluded.get("행사 기간 일별 세 구분 누락·수치 오류"):
        return "대기", None
    if not labels or not labels[0]["usable_for_training"]:
        return "채점 불가", None
    label = labels[0]
    quantity = {
        "id": identifier("q", [event["id"], "prereg-silver", label["daily_mean"]]),
        "name": "시군구 순증 실버 추정", "value": label["daily_mean"],
        "p10": None, "p50": None, "p90": None, "unit": "명/일", "timeUnit": "일",
        "spatialScope": "시군구", "valueKind": "관측", "estimated": True,
        "assumptionIds": [], "announcedAt": frame["available_at"].max().isoformat(),
    }
    return "채점 완료", quantity


# 공개 해시를 확인한 준비본의 전체 선정 집합·본문을 원장과 대조한 뒤 채점한다.
def score_entries(entries: list[dict[str, Any]], preparation: dict[str, Any],
                  region_daily: pl.DataFrame, statuses: list[dict[str, str]]) -> dict[str, Any]:
    verify_ledger(entries)
    summaries = {row["forecastId"]: row for row in preparation["summaries"]}
    payloads = {row["forecastId"]: row for row in preparation["payloads"]}
    if (set(payloads) != {entry["forecastId"] for entry in entries}
            or len(payloads) != len(preparation["payloads"]) or set(summaries) != set(payloads)):
        raise ValueError("원장과 공개 준비본의 forecastId 집합 불일치 — 일부 채점 금지")
    cancelled = {row["eventId"] for row in statuses}
    metadata = preparation["metadata"]
    conversion = metadata["conversion"]
    if canonical(conversion["settings"]) != canonical(rules.conversion_settings()):
        raise ValueError("등록 당시 환산·판정 설정과 다릅니다 — 고정 버전에서 채점 필요")
    results = []
    for entry in entries:
        forecast_id = entry["forecastId"]
        if (payloads.get(forecast_id) != {key: entry[key] for key in PAYLOAD_KEYS}
                or rules.local_date(entry["registeredAt"]) != rules.REGISTRATION_DATE):
            raise ValueError("원장과 등록 준비본의 본문·등록일 불일치")
        summary = summaries[forecast_id]
        event = preparation["events"][entry["eventId"]]
        if entry["eventId"] in cancelled:
            status, actual = "취소", None
        else:
            status, actual = actual_status(event, region_daily)
        result = {
            **{key: entry[key] for key in ("seq", "eventId", "leadDays")},
            **{key: summary[key] for key in ("name", "startsAt", "endsAt")},
            **entry["forecast"], "actual": actual, "status": status,
            "inInterval": None, "levelMatch": None,
        }
        if actual is not None:
            observed = actual["value"]
            _, judgment = distribution([observed] * 3, event, seed=conversion["seed"],
                                       n=conversion["samples"], basis=metadata["g0"]["basis"])
            result.update(inInterval=entry["forecast"]["dailyMeanP10"] <= observed
                          <= entry["forecast"]["dailyMeanP90"],
                          levelMatch=entry["forecast"]["level"] == judgment.judgment["level"])
        results.append(result)

    # 건수를 별도 공개하며 불가·취소·대기는 포함률의 분모에 들어가지 않는다.
    response = {
        "registeredAt": (entries[0]["registeredAt"] if entries
                         else f"{rules.REGISTRATION_DATE}T00:00:00+09:00"),
        "tag": metadata["tag"], "rulesDoc": metadata["rulesDoc"], "entries": results,
        "summary": {"registered": len(results), "scored": sum(r["status"] == "채점 완료" for r in results),
                    "inInterval": sum(r["inInterval"] is True for r in results),
                    "unscorable": sum(r["status"] == "채점 불가" for r in results),
                    "cancelled": sum(r["status"] == "취소" for r in results)},
    }
    validate("preregistration-scores", response)
    return response


# 최신 batch가 바뀌어도 등록 준비본과 원장만 사용해 점수를 계산한다.
def scores(client: httpx.Client | None = None, *,
           status_sources: list[dict[str, str]] | None = None) -> dict[str, Any]:
    if client is None:
        with httpx.Client(base_url=RECORDS_URL, timeout=15) as records:
            return scores(records, status_sources=status_sources)
    entries = read_ledger(client)
    statuses = load_statuses()
    draft_exists = (paths.PROCESSED / "prereg_payloads.json").exists()
    public_exists = rules.public_meta_path().exists()
    if not entries and not draft_exists and not public_exists:
        result = {"registeredAt": f"{rules.REGISTRATION_DATE}T00:00:00+09:00",
                  "tag": rules.TAG, "rulesDoc": rules.RULES_DOC, "entries": [],
                  "summary": dict.fromkeys(
                      ("registered", "scored", "inInterval", "unscorable", "cancelled"), 0)}
        validate("preregistration-scores", result)
        return result
    preparation = load_preparation()
    if {entry["forecastId"] for entry in entries} != {row["forecastId"] for row in preparation["payloads"]}:
        raise ValueError("원장과 공개 준비본의 forecastId 집합 불일치 — 일부 채점 금지")
    region_daily = pl.read_parquet(paths.PROCESSED / "region_daily.parquet")
    result = score_entries(entries, preparation, region_daily, statuses)
    if status_sources is not None:
        registered = {entry["eventId"] for entry in entries}
        status_sources.extend(row for row in statuses if row["eventId"] in registered)
    return result
