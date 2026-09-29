"""개최계획의 출처 행과 머리글이 일치할 때만 발표 대상 연도를 복원한다."""

import re
from typing import Any


# 머리글에 명시된 연도나 전년 표현만 읽고 집계 기간·발표일은 추정하지 않는다.
def stated_year(heading: str, plan_year: int) -> int | None:
    if "방문객" not in heading:
        return None
    years = {int(value) for value in re.findall(r"(?<!\d)((?:19|20)\d{2})\s*년", heading)}
    if re.search(r"前\s*년|전\s*년", heading):
        years.add(plan_year - 1)
    return next(iter(years)) if len(years) == 1 else None


# 인원과 보존된 머리글까지 같은 단일 출처만 사용해 합쳐진 행사 행의 오연결을 막는다.
def restore_years(
    events: dict[str, dict[str, Any]],
    plans: list[dict[str, Any]],
) -> tuple[dict[str, dict[str, Any]], int]:
    index: dict[str, list[dict[str, Any]]] = {}
    for row in plans:
        ref = f"문체부:{row.get('source_file', '')}:{row.get('source_sheet', '')}:{row.get('source_row', '')}"
        index.setdefault(ref, []).append(row)
    result, restored = {}, 0
    for event_id, original in events.items():
        event = dict(original)
        matches = [row for ref in event.get("source_refs", []) for row in index.get(ref, [])]
        if event.get("visitors_announced_year") is None and len(matches) == 1:
            row = matches[0]
            heading = row.get("visitors_announced_meaning")
            year = row.get("year")
            if (
                isinstance(heading, str)
                and isinstance(year, int)
                and heading == event.get("visitors_announced_meaning")
                and row.get("visitors_announced") is not None
                and row["visitors_announced"] == event.get("visitors_announced")
            ):
                target = stated_year(heading, year)
                if target is not None:
                    event["visitors_announced_year"] = target
                    event["visitors_announced_year_basis"] = heading
                    restored += 1
        result[event_id] = event
    return result, restored
