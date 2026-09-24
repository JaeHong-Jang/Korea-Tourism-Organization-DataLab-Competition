"""TourAPI 시작일 범위를 제한하고 이름·행정구역 점수와 좌표 검증으로 일정을 보강한다."""

import json
import re
import unicodedata
from datetime import UTC, date, datetime

from crowdcast.data.admin_dict import normalize_sido
from crowdcast.data.datago_client import DataGoClient
from crowdcast.data.geocode import Gazetteer, festival_location, match_festival
from crowdcast.data.tourapi import search_festivals

WINDOW_START, WINDOW_END = date(2026, 9, 29), date(2026, 11, 30)


# 연도·회차·공백·문장부호만 지워 봄·가을 같은 행사 구분은 남긴다.
def normalized_name(value: str) -> str:
    value = unicodedata.normalize("NFKC", value).lower()
    value = re.sub(r"제\s*\d+\s*회", "", value)
    value = re.sub(r"(?<!\d)(?:19|20)\d{2}\s*년?", "", value)
    return re.sub(r"[^가-힣a-z0-9]", "", value)


# 완전한 기간은 겹침으로 묶고 한쪽 날짜만 있으면 그 날짜가 포함된 기간에만 합친다.
def occurrence_groups(rows: list[dict], held: list[str]) -> list[list[dict]]:
    dated = sorted((row for row in rows if row["start"] and row["end"]),
                   key=lambda row: (row["start"], row["end"], json.dumps(row, sort_keys=True, default=str)))
    undated = [row for row in rows if not row["start"] and not row["end"]]
    groups: list[list[dict]] = []
    end = None
    for row in dated:
        if end is None or row["start"] > end:
            groups.append([])
        groups[-1].append(row)
        end = max(end, row["end"]) if end else row["end"]
    # 부분 일정이 알려진 완전 기간 밖이면 원문과 양쪽 기간을 보존한 별도 회차로 둔다.
    periods = [(min(r["start"] for r in g), max(r["end"] for r in g)) for g in groups]
    partial: dict[date, list[dict]] = {}
    for row in sorted(rows, key=lambda r: json.dumps(r, sort_keys=True, default=str)):
        if bool(row["start"]) == bool(row["end"]):
            continue
        known = row["start"] or row["end"]
        matches = [i for i, (start, end) in enumerate(periods) if start <= known <= end]
        if len(matches) == 1:
            groups[matches[0]].append(row)
        else:
            partial.setdefault(known, []).append(row)
            if periods:
                held.append("병합 보류: " + json.dumps({"event_id": row["event_id"], "partial": row,
                    "complete": dated}, ensure_ascii=False, sort_keys=True, default=str))
    groups.extend(partial[key] for key in sorted(partial))
    if undated:
        if len(groups) == 1:
            groups[0].extend(undated)
        else:
            groups.append(undated)
    return groups


# 떨어진 회차는 시작 월로, 같은 달의 복수 회차는 시작 월일로 ID를 구별한다.
def merge_duplicates(events: list[dict], audit: list[dict] | None = None) -> tuple[list[dict], list[str]]:
    from crowdcast.data.events import event_id

    # 기존 ID별로 회차를 분리해 단일 회차 해시는 그대로 둔다.
    groups: dict[str, list[dict]] = {}
    for event in events:
        groups.setdefault(event["event_id"], []).append(event)
    result, conflicts = [], []
    for identity, rows in sorted(groups.items()):
        occurrences = occurrence_groups(rows, conflicts)
        if audit is not None and len(rows) > 1:
            audit.append({"event_id": identity, "input_rows": len(rows), "occurrences": len(occurrences)})
        days = [min((row["start"] or row["end"] for row in group if row["start"] or row["end"]),
                    default=None) for group in occurrences]
        months = [day.month if day else 0 for day in days]
        for day, month, group in zip(days, months, occurrences, strict=True):
            merged, issues = merge_occurrence(group)
            if len(occurrences) > 1:
                merged["planned_month"] = month or None
                merged["event_id"] = event_id(merged["name"], merged["year"], merged["sigungu_code"],
                    f"{merged['sido'] or ''}:{merged['sigungu_text'] or ''}", planned_month=month,
                    planned_day=day if months.count(month) > 1 else None)
            result.append(merged)
            conflicts.extend(issues)
    return sorted(result, key=lambda row: row["event_id"]), conflicts


# 같은 회차의 출처·기간은 합치고 서로 다른 발표 수치·정의는 비워 둔다.
def merge_occurrence(group: list[dict]) -> tuple[dict, list[str]]:
    from crowdcast.data.events import continuity_break

    # 값 선택 순서가 입력 순서에 좌우되지 않도록 먼저 정렬한다.
    conflicts = []
    group.sort(key=lambda row: json.dumps(row, ensure_ascii=False, sort_keys=True, default=str))
    merged = dict(group[0])
    identity = merged["event_id"]
    for field in merged:
        if isinstance(merged[field], list):
            merged[field] = sorted({value for row in group for value in row[field]})
            continue
        values = {json.dumps(row[field], ensure_ascii=False, sort_keys=True, default=str): row[field]
                  for row in group if row[field] is not None}
        if len(values) == 1:
            merged[field] = next(iter(values.values()))
        elif len(values) > 1 and field not in {
            "name", "sigungu_text", "venue", "date_text", "sigungu_match"
        }:
            conflicts.append(f"{identity}: {field} = {sorted(values)}")
            if field in {"budget_krw", "edition", "planned_month", "visitors_announced",
                         "visitors_announced_meaning", "time_of_day"}:
                merged[field] = None
    # 겹침을 확인한 완전한 기간끼리만 합집합을 취하고 원문 감사 열도 함께 보존한다.
    for fields in (("start", "end"), ("start_mcst", "end_mcst")):
        periods = [(row[fields[0]], row[fields[1]]) for row in group
                   if row[fields[0]] is not None and row[fields[1]] is not None]
        if periods:
            merged[fields[0]], merged[fields[1]] = min(p[0] for p in periods), max(p[1] for p in periods)
    # 결측은 충돌이 아니며 실제 수치나 의미가 상충할 때만 잘못된 쌍을 막는다.
    fields = ("visitors_announced", "visitors_announced_meaning")
    if any(len({row[field] for row in group if row[field] is not None}) > 1 for field in fields):
        merged.update(dict.fromkeys(fields))
    merged["continuity_break"] = continuity_break(merged)
    return merged, conflicts


# 종료일 필터로 11월 시작·12월 종료 축제가 빠지지 않게 시작 하한만 서버에 보낸다.
def fetch_festivals(client: DataGoClient) -> list[dict]:
    if client.ledger.max_calls > 30:
        raise ValueError("T-102 TourAPI 호출 예산은 재시도를 포함해 30건 이하여야 합니다")
    return search_festivals(client, WINDOW_START)


# 잘못된 날짜와 역전된 기간은 날짜 보강의 근거로 쓰지 않는다.
def festival_period(item: dict) -> tuple[date, date] | None:
    try:
        values = [str(item.get(field, "")) for field in ("eventstartdate", "eventenddate")]
        if not all(re.fullmatch(r"\d{8}", value) for value in values):
            return None
        start, end = (datetime.strptime(value, "%Y%m%d").date() for value in values)
        return (start, end) if WINDOW_START <= start <= WINDOW_END and end >= start else None
    except ValueError:
        return None


# 보강한 행의 ID는 유지하고 원문 일정·발표 방문객은 덮어쓰지 않는다.
def enrich_events(
    events: list[dict], items: list[dict], gazetteer: Gazetteer
) -> tuple[list[dict], list[dict]]:
    from crowdcast.data.events import continuity_break, make_event

    result = [{**event} for event in events]
    audit, proposals = [], {}
    for item in sorted(items, key=lambda row: (available_key(row.get("available_at")),
                       str(row.get("contentid", "")), json.dumps(row, sort_keys=True, default=str))):
        period = festival_period(item)
        if period is None or not normalized_name(str(item.get("title") or "")):
            audit.append({"contentid": item.get("contentid"), "action": "범위 밖 또는 날짜·이름 오류"})
            continue
        code, lat, lng, location_status = festival_location(item, gazetteer)
        target, score, reason = match_festival(item, code, events, gazetteer)
        record = {
            "contentid": item.get("contentid"),
            "title": item["title"],
            "score": round(score, 6),
            "rule": reason,
            "coordinate": location_status,
            "sigungu_code": code,
            "available_at": item.get("available_at"),
            "source_hash": item.get("source_hash"),
            "tourapi_start": period[0].isoformat(),
            "tourapi_end": period[1].isoformat(),
        }
        if target is None:
            region = gazetteer.regions.get(code, {})
            event = make_event(
                {
                    "festival_name": item["title"],
                    "year": 2026,
                    "sido": region.get("sido"),
                    "sigungu_name": region.get("sigungu_name"),
                    "venue": item.get("addr1"),
                    "start_date": period[0],
                    "end_date": period[1],
                },
                gazetteer,
            )
            event.update(source=["TourAPI"], source_refs=[], date_text=None, start_mcst=None, end_mcst=None,
                         date_source="TourAPI", planned_month=period[0].month,
                         date_available_at=item.get("available_at"))
            result.append(event)
            record["action"] = "추가"
        else:
            event = next(row for row in result if row["event_id"] == target["event_id"])
            record["action"] = "보강"
            record.update(mcst_date_text=event["date_text"], mcst_source_refs=event["source_refs"],
                          start_mcst=str(event["start_mcst"]) if event["start_mcst"] else None,
                          end_mcst=str(event["end_mcst"]) if event["end_mcst"] else None)
        record["event_id"] = event["event_id"]
        audit.append(record)
        # 원문의 어느 한쪽 날짜라도 다르면 출처·좌표도 바꾸지 않고 양쪽 일정을 QC에 남긴다.
        if target and any(event[field] is not None and event[field] != value
                          for field, value in zip(("start", "end"), period, strict=True)):
            record["action"] = "보류: 일정 충돌"
            continue
        key = (event["event_id"], None if target else period)
        proposals.setdefault(key, []).append((event, item, period, lat, lng, record))
    # 같은 행사에 서로 다른 TourAPI 일정이 있으면 임의로 하나를 고르지 않는다.
    for group in proposals.values():
        if len({entry[2] for entry in group}) > 1:
            for *_, record in group:
                record["action"] = "보류: 복수 TourAPI 일정"
            continue
        # 같은 날짜라도 서로 다른 점이 주어지면 행사장 위치를 임의로 고르지 않는다.
        coordinates = {(entry[3], entry[4]) for entry in group if entry[3] is not None}
        earliest = min((entry[1].get("available_at") for entry in group), key=available_key)
        for event, item, period, lat, lng, record in group:
            if event["start"] is None or event["end"] is None:
                event.update(start=period[0], end=period[1], planned_month=period[0].month,
                             date_source="TourAPI", date_available_at=earliest)
            elif record["action"] == "보강":
                record["action"] = "출처 추가"
            if event["date_source"] == "TourAPI":
                event["date_available_at"] = min((event["date_available_at"], earliest), key=available_key)
            event["source"] = sorted(set(event["source"]) | {"TourAPI"})
            event["source_refs"] = sorted(
                set(event["source_refs"])
                | {
                    f"TourAPI:{item['contentid']}:{item.get('source_hash', '')}:"
                    f"{item.get('available_at', '')}"
                }
            )
            if len(coordinates) > 1:
                record["coordinate"] = "보류: 복수 TourAPI 좌표"
            elif lat is not None:
                # 코드가 비어 있으면 부모가 아닌 실제 점이 속한 2025 시군구로 보강한다.
                if not event["sigungu_code"]:
                    located = gazetteer.locate(lat, lng)
                    if len(located) == 1:
                        region = gazetteer.regions[located[0]]
                        if normalize_sido(event["sido"]) == region["sido"]:
                            event.update(sigungu_code=located[0], sigungu_name=region["sigungu_name"],
                                         sido=region["sido"], sigungu_match="tourapi")
                if gazetteer.covers(event["sigungu_code"], lat, lng):
                    event.update(lat=lat, lng=lng, coord_source="tourapi")
            event["continuity_break"] = continuity_break(event)
    return result, audit


# 시간대가 다른 응답도 실제 공개 시각으로 비교하고 결측 시점은 마지막에 둔다.
def available_key(value: str | None) -> tuple[datetime, str]:
    instant = datetime.fromisoformat(value).astimezone(UTC) if value else datetime.max.replace(tzinfo=UTC)
    return instant, value or ""
