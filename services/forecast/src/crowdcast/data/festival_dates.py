"""TourAPI 시작일 범위를 제한하고 이름·행정구역 점수와 좌표 검증으로 일정을 보강한다."""

import re
import unicodedata
from datetime import date, datetime
from difflib import SequenceMatcher

from crowdcast.data.admin_dict import normalize_sido
from crowdcast.data.datago_client import DataGoClient
from crowdcast.data.geocode import Gazetteer
from crowdcast.data.tourapi import search_festivals

WINDOW_START, WINDOW_END = date(2026, 9, 29), date(2026, 11, 30)


# 연도·회차·공백·문장부호만 지워 봄·가을 같은 행사 구분은 남긴다.
def normalized_name(value: str) -> str:
    value = unicodedata.normalize("NFKC", value).lower()
    value = re.sub(r"제\s*\d+\s*회", "", value)
    value = re.sub(r"(?<!\d)(?:19|20)\d{2}\s*년?", "", value)
    return re.sub(r"[^가-힣a-z0-9]", "", value)


# 날짜가 있는 행은 겹치는 연결 구간으로 나누고 미정 행은 확인된 단일 회차에만 합친다.
def occurrence_groups(rows: list[dict]) -> list[list[dict]]:
    dated = sorted((row for row in rows if row["start"] and row["end"]),
                   key=lambda row: (row["start"], row["end"]))
    undated = [row for row in rows if not (row["start"] and row["end"])]
    groups: list[list[dict]] = []
    end = None
    for row in dated:
        if end is None or row["start"] > end:
            groups.append([])
        groups[-1].append(row)
        end = max(end, row["end"]) if end else row["end"]
    if undated:
        if len(groups) == 1:
            groups[0].extend(undated)
        else:
            groups.append(undated)
    return groups


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


# 주소의 행정명과 점-다각형 결과를 대조하고 불일치 좌표는 채택하지 않는다.
def festival_location(item: dict, gazetteer: Gazetteer) -> tuple[str | None, float | None, float | None, str]:
    address = " ".join(str(item.get(key) or "") for key in ("addr1", "addr2"))
    hits = gazetteer.candidates(address)
    code = hits[0]["sigunguCode"] if len(hits) == 1 else None
    try:
        lat, lng = float(item["mapy"]), float(item["mapx"])
    except (KeyError, ValueError, TypeError):
        return code, None, None, "좌표 없음"
    if code:
        return (
            (code, lat, lng, "일치")
            if gazetteer.covers(code, lat, lng)
            else (code, None, None, "주소·좌표 불일치")
        )
    located = gazetteer.locate(lat, lng)
    if len(located) == 1 and (not hits or located[0] in {hit["sigunguCode"] for hit in hits}):
        return located[0], lat, lng, "점-다각형"
    return None, None, None, "행정구역 모호 또는 좌표 불일치"


# 코드가 비어 있으면 같은 시도까지 후보를 넓히되 이름 기준과 차점 간격은 유지한다.
def match_festival(
    item: dict, code: str | None, events: list[dict], gazetteer: Gazetteer
) -> tuple[dict | None, float, str]:
    if not code:
        return None, 0.0, "지역 미확정"
    name = normalized_name(item.get("title", ""))
    scored, review = [], []
    region = gazetteer.regions[code]
    for event in events:
        target = event["sigungu_code"]
        if event["year"] != 2026:
            continue
        other = normalized_name(event["name"])
        score = SequenceMatcher(None, name, other).ratio() if name and other else 0.0
        province = normalize_sido(event["sido"])
        if not target and not province and score >= 0.92:
            review.append(event["event_id"])
        if (target and target not in {code, region["parent_code"]}) or (
            not target and province != region["sido"]
        ):
            continue
        scored.append((score, event["event_id"], event))
    scored.sort(key=lambda value: (-value[0], value[1]))
    review_note = "; 검토 필요: 시도 미확정 " + ", ".join(sorted(review)) if review else ""
    if not scored:
        return None, 0.0, "지역 내 후보 없음" + review_note
    score = scored[0][0]
    if score < 0.92 or (len(scored) > 1 and score - scored[1][0] < 0.08):
        return None, score, "이름 점수 미달 또는 동점" + review_note
    target = scored[0][2]
    rule = "정규화 이름 일치" if score == 1 else "이름 유사도"
    if not target["sigungu_code"]:
        rule += " (동일 시도·코드 미정)"
    return target, score, rule + review_note


# 보강한 행의 ID는 유지하고 원문 일정·발표 방문객은 덮어쓰지 않는다.
def enrich_events(
    events: list[dict], items: list[dict], gazetteer: Gazetteer
) -> tuple[list[dict], list[dict]]:
    from crowdcast.data.events import continuity_break, make_event

    result = [{**event} for event in events]
    audit, proposals = [], {}
    for item in sorted(items, key=lambda row: str(row.get("contentid", ""))):
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
        for event, item, period, lat, lng, record in group:
            if event["start"] is None or event["end"] is None:
                event.update(start=period[0], end=period[1], planned_month=period[0].month,
                             date_source="TourAPI", date_available_at=item.get("available_at"))
            elif record["action"] == "보강":
                record["action"] = "출처 추가"
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
