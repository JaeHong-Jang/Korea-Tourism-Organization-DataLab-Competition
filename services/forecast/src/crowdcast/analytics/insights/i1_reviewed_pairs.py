"""원문 대조를 마친 행사별 발표·관측 자료를 I1 전용 목록에 연결한다."""

import json
import math
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

from crowdcast.analytics.insights.records import day


# 확인된 두 수치와 각각의 기간·출처가 없으면 보완 자료를 사용하지 않는다.
def reviewed_pairs(path: Path, today: date) -> list[dict]:
    if not path.is_file():
        return []
    document = json.loads(path.read_text(encoding="utf-8"))
    if document.get("version") != 1 or not isinstance(document.get("rows"), list):
        raise ValueError("I1 검토 자료 형식 오류")
    seen = set()
    for row in document["rows"]:
        start, end = day(row.get("start")), day(row.get("end"))
        checked = day(row.get("checkedAt"))
        if (
            not row.get("eventId")
            or row["eventId"] in seen
            or not row.get("eventName")
            or not row.get("region")
            or type(row.get("year")) is not int
            or not start
            or not end
            or start > end
            or end >= today
            or start.year != row["year"]
            or end.year != row["year"]
            or not checked
            or checked > today
            or not row.get("limitation")
            or not row.get("scope")
            or row.get("directComparable") is not False
            or len(row.get("sources", [])) < 2
        ):
            raise ValueError("I1 검토 자료의 행사·기간·출처 오류")
        for key in ("announced", "observed"):
            quantity = row.get(key, {})
            if (
                type(quantity.get("value")) not in (int, float)
                or not math.isfinite(quantity["value"])
                or quantity["value"] < 0
                or quantity.get("unit") not in ("명", "매", "명/일", "명(센서 연인원)")
                or not quantity.get("label")
            ):
                raise ValueError("I1 검토 자료 수치·단위 오류")
        observed_start, observed_end = day(row.get("observedStart")), day(row.get("observedEnd"))
        if not observed_start or not observed_end or observed_start > observed_end or observed_end >= today:
            raise ValueError("I1 관측 기간 오류")
        for source in row["sources"]:
            link = urlparse(source.get("url", ""))
            if not source.get("title") or not (
                source.get("file") or (link.scheme == "https" and link.netloc)
            ):
                raise ValueError("I1 검토 자료 출처 오류")
        seen.add(row["eventId"])
    return document["rows"]


# 실제 일정 보정은 복제한 I1 행사에만 적용하여 학습·예보 입력을 유지한다.
def attach_reviewed(events: dict, rows: list[dict]) -> tuple[dict, list[dict], list[dict]]:
    updated = {key: dict(value) for key, value in events.items()}
    public, reports = [], []
    for row in rows:
        identifier = row["eventId"]
        existing = updated.get(identifier)
        if existing and existing["year"] != row["year"]:
            raise ValueError("I1 검토 자료 대상 연도 불일치")
        updated[identifier] = {
            **(existing or {}),
            "event_id": identifier,
            "name": row["eventName"],
            "year": row["year"],
            "start": day(row["start"]),
            "end": day(row["end"]),
            "sigungu_name": row["region"],
            "date_basis": "공식 자료 확인 일정",
        }
        public.append({**row, "id": f"reviewed-{identifier}", "status": "conditions_unverified"})
        observation_source = row["sources"][-1]
        reports.append(
            {
                "eventId": identifier,
                "year": row["year"],
                "value": row["observed"]["value"],
                "unit": row["observed"]["unit"],
                "label": row["observed"]["label"],
                "scope": row["scope"],
                "note": row["limitation"],
                "from": row["observedStart"],
                "to": row["observedEnd"],
                "title": observation_source["title"],
                "url": observation_source.get("url", ""),
                "page": observation_source.get("page", "본문"),
            }
        )
    return updated, public, reports
