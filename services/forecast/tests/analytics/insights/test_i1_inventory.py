"""전체 목록의 전년도 발표·회차·지역 대용치가 실제 비교쌍으로 부풀려지지 않는지 확인한다."""

import json
from datetime import date

import polars as pl
from crowdcast.analytics.insights import i1
from crowdcast.analytics.insights.i1_inventory import collection_inventory
from crowdcast.analytics.insights.records import Inputs


# 같은 이름·지역의 다른 연도 행사와 전년도 방문객 필드를 구성한다.
def event(identifier, year, value=None, target_year=None, end=None):
    return {
        "event_id": identifier,
        "name": "연천 구석기축제",
        "year": year,
        "sigungu_code": "41800",
        "sigungu_name": "연천군",
        "start": date(year, 5, 2),
        "end": end or date(year, 5, 5),
        "visitors_announced": value,
        "visitors_announced_year": target_year,
        "source_refs": [f"개최계획-{year}"],
    }


# 과거 대상 연도를 지키면서 값 0과 미확보를 구분하고 반복 행사를 계산한다.
def test_previous_announcement_is_connected_to_target_year():
    events = {"a": event("a", 2020), "b": event("b", 2021, 0, 2020), "c": event("c", 2022, 77, 2021)}
    data = collection_inventory(Inputs("2022-09-28T00:00:00+09:00"), events, [], set())
    rows = {row["id"]: row for row in data["rows"]}
    assert rows["a"]["announced"]["value"] == 0
    assert rows["b"]["announced"]["value"] == 77
    assert rows["c"]["announced"] is None
    assert data["repeatedGroups"] == data["threeYearGroups"] == 1
    assert rows["a"]["recurrenceYears"] == [2020, 2021, 2022]


# 과거 발표 연도가 확인되면 일정 누락 때문에 수치를 숨기지 않는다.
def test_past_announcements_without_schedule_remain_visible():
    old = event("old", 2023)
    old.update(start=None, end=None)
    current = event("current", 2026)
    current.update(start=None, end=None)
    events = {
        "old": old,
        "source": event("source", 2024, 12500, 2023),
        "current": current,
    }
    data = collection_inventory(Inputs("2026-09-28T00:00:00+09:00"), events, [], set())
    rows = {row["id"]: row for row in data["rows"]}
    assert rows["old"]["status"] == "announced"
    assert rows["old"]["announced"]["value"] == 12500
    assert rows["old"]["dateBasis"] == "발표 대상 연도"
    assert rows["old"]["end"] is None
    assert "current" not in rows
    for summary in data["years"]:
        assert summary["registered"] == summary["ended"] + summary["dateMissing"] + summary["notEnded"]


# 기본 I1은 2020~2026년 종료 행사만 집계하되 다음 해 문서의 전년 발표값도 연결한다.
def test_default_seven_year_scope_preserves_later_announcement():
    events = {
        "old": event("old", 2019),
        "first": event("first", 2020),
        "last": event("last", 2026),
        "new": event("new", 2027, 77, 2026),
    }
    inputs = Inputs("2026-09-28T00:00:00+09:00", events=pl.DataFrame(list(events.values())))
    result = i1.calculate(inputs)
    data = json.loads(result["evidence"][0]["summary"])["collectionInventory"]
    assert [row["year"] for row in data["years"]] == list(range(2020, 2027))
    assert {row["id"] for row in data["rows"]} == {"first", "last"}
    assert next(row for row in data["rows"] if row["id"] == "last")["announced"]["value"] == 77
    assert result["period"] == {"from": "2020-01-01", "to": "2026-09-28"}


# 연간 발표값이 하나여도 같은 해 여러 회차에 나눠 넣지 않는다.
def test_multiple_editions_and_conflicting_values_require_review():
    events = {"a": event("a", 2021), "b": event("b", 2021), "c": event("c", 2022, 50, 2021)}
    data = collection_inventory(Inputs("2022-09-28T00:00:00+09:00"), events, [], set())
    for row in data["rows"][:2]:
        assert row["announced"] is None
        assert row["needsReview"] is True


# 지역의 음수 순증을 관측 방문객이나 자료 없음으로 바꾸지 않는다.
def test_regional_increment_stays_separate_from_observation():
    inputs = Inputs(
        "2022-09-28T00:00:00+09:00",
        labels=pl.DataFrame(
            [
                {
                    "event_id": "a",
                    "is_primary": True,
                    "label_tier": "silver",
                    "daily_mean": -20.0,
                    "total": -80.0,
                }
            ]
        ),
    )
    data = collection_inventory(inputs, {"a": event("a", 2021)}, [], set())
    row = data["rows"][0]
    assert row["regional"]["value"] == -20
    assert row["observed"] is None
    assert row["status"] == "missing"
    assert data["years"][1]["regional"] == 1


# 공개 사례가 연결되어도 직접 비교 확정 여부는 따로 유지한다.
def test_public_pair_preserves_ticket_unit_without_promoting_comparability():
    public = [
        {
            "eventId": "a",
            "id": "source-a",
            "announced": {"value": 55, "unit": "매"},
            "observed": {"value": 140, "unit": "명"},
            "limitation": "집계 단위 다름",
            "sources": [],
        }
    ]
    data = collection_inventory(Inputs("2022-09-28T00:00:00+09:00"), {"a": event("a", 2020)}, public, set())
    assert data["rows"][0]["status"] == "both"
    assert data["rows"][0]["announced"]["unit"] == "매"
    assert data["rows"][0]["directComparable"] is False


# 종료일 없음·당일 종료·미래 일정은 종료된 표본에 포함하지 않는다.
def test_date_exclusions_and_report_period_are_explicit():
    rows = {
        "missing": event("missing", 2020),
        "today": event("today", 2022, end=date(2022, 9, 28)),
        "future": event("future", 2022, end=date(2022, 12, 31)),
    }
    rows["missing"]["end"] = None
    inputs = Inputs("2022-09-28T00:00:00+09:00")
    empty = collection_inventory(inputs, rows, [], set())
    assert not empty["rows"]
    report = {
        "eventId": "missing",
        "from": "2020-03-30",
        "to": "2020-04-07",
        "value": 100,
        "unit": "명",
        "label": "센서 연인원",
        "scope": "보고서 구역",
        "note": "중복 포함",
        "title": "관측 보고서",
        "url": "https://www.sdm.go.kr/report.pdf",
    }
    actual = collection_inventory(inputs, rows, [], set(), [report])
    assert actual["rows"][0]["dateBasis"] == "보고서 분석 기간"
    assert actual["years"][0]["dateMissing"] == 0
    assert actual["years"][0]["ended"] == 1
