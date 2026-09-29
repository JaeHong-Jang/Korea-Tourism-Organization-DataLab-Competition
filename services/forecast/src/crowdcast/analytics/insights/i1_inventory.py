"""전체 종료 일정의 발표·축제 관측·지역 참고 자료를 각각 연결해 수집 범위를 계산한다."""

from collections import Counter, defaultdict
from typing import Any

from crowdcast.analytics.insights.i1_alignment import comparison_basis
from crowdcast.analytics.insights.records import GOLD, Inputs, day, number
from crowdcast.features.history_features import festival_key

I1_YEARS = tuple(range(2020, 2027))


# 같은 연도의 여러 회차는 연간 발표 수치를 나눠 붙이지 않고 확인 과제로 남긴다.
def announcement_index(events: dict[str, dict[str, Any]]) -> dict:
    result: dict = defaultdict(list)
    for event in events.values():
        key = festival_key(event)
        if key[1] and type(event.get("visitors_announced_year")) is int:
            if number(event.get("visitors_announced")) is not None:
                result[(key, event["visitors_announced_year"])].append(event)
    return result


# 출처가 같은 값은 중복 제거하되 다른 값이나 회차 모호성은 임의로 해결하지 않는다.
def announced_quantity(candidates: list[dict], ambiguous: bool) -> tuple[dict | None, list[str]]:
    values = {row["visitors_announced"] for row in candidates}
    sources = sorted({ref for row in candidates for ref in row.get("source_refs", [])})
    if len(values) != 1 or ambiguous:
        return None, sources
    return {"value": values.pop(), "unit": "명", "label": "개최계획 방문객 기재값"}, sources


# 음수 지역 순증은 실제 방문객 수와 구분하여 원래 부호를 보존한다.
def label_quantities(labels: list[dict]) -> tuple[dict | None, dict | None, list[str]]:
    observation, regional, sources = None, None, []
    for label in labels:
        if not label.get("is_primary"):
            continue
        sources.append(f"{label.get('source_file', '')} · {label.get('source_row', '')}")
        total = number(label.get("total"))
        if label.get("label_tier") in GOLD and total is not None:
            observation = {"value": total, "unit": "명", "label": "축제 통신 방문객 추정"}
        elif label.get("label_tier") == "silver":
            value = label.get("daily_mean")
            if isinstance(value, (int, float)) and abs(value) < float("inf"):
                regional = {"value": value, "unit": "명/일", "label": "시군구 평소 대비 방문 증감"}
    return observation, regional, sources


# 완료 여부를 추정하지 않고 등록 종료일이 지난 행사만 목록에 포함한다.
def collection_inventory(
    inputs: Inputs,
    events: dict[str, dict[str, Any]],
    public: list[dict],
    matched_ids: set[str],
    reports: list[dict] | None = None,
    years: tuple[int, ...] = I1_YEARS,
) -> dict[str, Any]:
    target = [row for row in events.values() if row.get("year") in years and row["year"] <= inputs.today.year]
    reports_by_id = {row["eventId"]: row for row in reports or []}
    announcements = announcement_index(events)
    group_counts = Counter((festival_key(row), row["year"]) for row in target)
    ended = [
        row
        for row in target
        if (day(row.get("end")) and day(row["end"]) < inputs.today)
        or (not day(row.get("end")) and row["event_id"] in reports_by_id)
        or (
            not day(row.get("end"))
            and row["year"] < inputs.today.year
            and announced_quantity(
                announcements.get((festival_key(row), row["year"]), []),
                group_counts[(festival_key(row), row["year"])] > 1,
            )[0]
            is not None
        )
    ]
    years_by_key: dict = defaultdict(set)
    for event in ended:
        key = festival_key(event)
        if key[1]:
            years_by_key[key].add(event["year"])
    labels: dict = defaultdict(list)
    for label in inputs.labels.to_dicts():
        labels[label["event_id"]].append(label)
    public_by_id = {row["eventId"]: row for row in public if row.get("eventId")}
    rows = []
    for event in ended:
        key = festival_key(event)
        candidates = announcements.get((key, event["year"]), []) if key[1] else []
        ambiguous = group_counts[(key, event["year"])] > 1
        announced, source_refs = announced_quantity(candidates, ambiguous)
        observed, regional, label_refs = label_quantities(labels.get(event["event_id"], []))
        review = bool(candidates) and announced is None
        public_row = public_by_id.get(event["event_id"])
        limitation = "집계 기간·구역·단위·중복 기준 확인 필요"
        report = reports_by_id.get(event["event_id"])
        if report:
            observed = {"value": report["value"], "unit": report["unit"], "label": report["label"]}
            report_period = report.get("periodLabel") or f"{report['from']}~{report['to']}"
            limitation = f"관측 분석 기간 {report_period} · {report['scope']}. {report['note']}"
            source_refs.append(f"{report['title']} · {report['url']} · {report.get('page', '쪽 미기록')}")
        if public_row:
            announced, observed = public_row["announced"], public_row["observed"]
            limitation = public_row["limitation"]
            review = False
            source_refs.extend(
                f"{source['title']} · {source.get('url') or source.get('file')}"
                for source in public_row["sources"]
            )
        status = (
            "both"
            if announced and observed
            else "announced"
            if announced
            else "observed"
            if observed
            else "missing"
        )
        rows.append(
            {
                "id": event["event_id"],
                "eventName": event["name"],
                "year": event["year"],
                "region": event.get("sigungu_name") or event.get("sido") or "지역 확인 필요",
                "start": str(event["start"]) if event.get("start") else report["from"] if report else None,
                "end": str(event["end"]) if event.get("end") else report["to"] if report else None,
                "dateBasis": event.get("date_basis")
                or ("등록 일정" if event.get("end") else "보고서 분석 기간" if report else "발표 대상 연도"),
                "periodLabel": event.get("observation_period_label"),
                "recurrenceYears": sorted(years_by_key[key]) if key[1] else [event["year"]],
                "announced": announced,
                "observed": observed,
                "regional": regional,
                "status": status,
                "needsReview": review,
                "directComparable": event["event_id"] in matched_ids,
                "limitation": limitation,
                "publicId": public_row["id"] if public_row else None,
                "sources": sorted(set(source_refs + label_refs)),
            }
        )
    # 같은 단위로 환산할 수 있는 행도 실제 집계 조건 검증과 구분해 제공한다.
    for row in rows:
        row["comparisonBasis"] = comparison_basis(row, reports_by_id.get(row["id"]))
    summary = []
    included_ids = {row["id"] for row in rows}
    for year in sorted(years):
        selected = [row for row in rows if row["year"] == year]
        status = Counter(row["status"] for row in selected)
        original = [row for row in target if row["year"] == year]
        summary.append(
            {
                "year": year,
                "registered": len(original),
                "ended": len(selected),
                "dateMissing": sum(
                    day(row.get("end")) is None and row["event_id"] not in included_ids for row in original
                ),
                "notEnded": sum(
                    bool(day(row.get("end"))) and day(row["end"]) >= inputs.today for row in original
                ),
                "announced": sum(row["announced"] is not None for row in selected),
                "observed": sum(row["observed"] is not None for row in selected),
                "regional": sum(row["regional"] is not None for row in selected),
                "needsReview": sum(row["needsReview"] for row in selected),
                "directComparable": sum(row["directComparable"] for row in selected),
                "statuses": {key: status[key] for key in ("both", "announced", "observed", "missing")},
            }
        )
    return {
        "version": 1,
        "asOf": inputs.today.isoformat(),
        "years": summary,
        "rows": sorted(rows, key=lambda row: (row["year"], row["eventName"], row["id"])),
        "repeatedGroups": sum(len(years) > 1 for years in years_by_key.values()),
        "threeYearGroups": sum(len(years) == 3 for years in years_by_key.values()),
        "reportSources": list(
            {row["url"]: {"title": row["title"], "url": row["url"]} for row in reports or []}.values()
        ),
        "scope": (
            "보유 목록의 종료 일정·과거 대상 연도 발표값·관측 보고서 기준. "
            "전체 행사의 실제 개최·취소 확인이나 전국 전수 집계는 아님"
        ),
    }
