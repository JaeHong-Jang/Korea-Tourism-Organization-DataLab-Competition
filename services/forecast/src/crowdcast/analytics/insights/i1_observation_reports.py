"""검토한 공개 관측 보고서를 정확한 행사 ID와 대상 연도에만 연결한다."""

import json
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

from crowdcast.analytics.insights.records import day, number


# 공개일 미상은 추정하지 않되 보고서의 분석 기간과 원본 출처를 필수로 확인한다.
def observation_reports(path: Path, today: date, events: dict) -> list[dict]:
    if not path.is_file():
        return []
    document = json.loads(path.read_text(encoding="utf-8"))
    if document.get("version") != 1 or not isinstance(document.get("rows"), list):
        raise ValueError("관측 보고서 입력 형식 오류")
    seen = set()
    for row in document["rows"]:
        event = events.get(row.get("eventId"))
        start, end = day(row.get("from")), day(row.get("to"))
        checked = day(row.get("checkedAt"))
        link = urlparse(row.get("url", ""))
        if (
            not event
            or event.get("year") != row.get("year")
            or row["eventId"] in seen
            or type(row.get("year")) is not int
            or not 1 <= row["year"] <= today.year
            or not start
            or not end
            or start > end
            or end >= today
            or start.year != row["year"]
            or end.year != row["year"]
            or not checked
            or checked > today
            or number(row.get("value")) is None
            or not all(
                isinstance(row.get(key), str) and row[key]
                for key in ("label", "unit", "scope", "note", "title")
            )
            or link.scheme != "https"
            or not link.netloc
        ):
            raise ValueError("관측 보고서 연결·수치·기간·출처 오류")
        published = row.get("publishedAt")
        if published and (not day(published) or day(published) > today):
            raise ValueError("관측 보고서 공개일 오류")
        seen.add(row["eventId"])
    return document["rows"]
