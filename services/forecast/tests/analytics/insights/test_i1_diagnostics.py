"""출처 기반 연도 복원과 중복 없는 비교 제외 진단을 검증한다."""

import json

import polars as pl
import pytest
from crowdcast.analytics.insights import i1
from crowdcast.analytics.insights.i1_announcements import restore_years, stated_year
from crowdcast.analytics.insights.records import Inputs


# 명시된 연도만 복원하고 서로 다른 연도가 섞이면 확정하지 않는다.
@pytest.mark.parametrize(
    "heading,year,expected",
    [
        ("방문객수(2018년기준, 단위 : 천명)", 2019, 2018),
        ("방문객수(前년) / 전체", 2026, 2025),
        ("방문객수(전년) / 내국인 + 방문객수(前년) / 외국인", 2025, 2024),
        ("방문객수(2023년)", 2024, 2023),
        ("방문객수 전체", 2026, None),
        ("방문객수(2023년, 2024년)", 2025, None),
        ("방문객수(前년, 2023년)", 2025, None),
        ("2023년 예산", 2024, None),
    ],
)
def test_stated_year(heading: str, year: int, expected: int | None) -> None:
    assert stated_year(heading, year) == expected


# 출처·인원·머리글이 맞아도 연도 이외의 비교 조건을 만들어 내지 않는다.
def test_restore_only_year() -> None:
    plan = dict(
        year=2026,
        source_file="plan.xlsx",
        source_sheet="목록",
        source_row=4,
        visitors_announced=100,
        visitors_announced_meaning="방문객수(前년)",
    )
    event = {**plan, "source_refs": ["문체부:plan.xlsx:목록:4"]}
    result, count = restore_years({"event": event}, [plan])
    assert count == 1
    assert result["event"]["visitors_announced_year"] == 2025
    assert "visitors_announced_year" not in event
    assert "visitors_announced_start" not in result["event"]
    assert "visitors_announced_available_at" not in result["event"]
    assert restore_years({"event": event}, [plan, plan])[1] == 0
    assert restore_years({"event": {**event, "visitors_announced": 101}}, [plan])[1] == 0
    assert restore_years({"event": {**event, "visitors_announced_meaning": "다른 자료"}}, [plan])[1] == 0
    assert (
        restore_years({"event": {**event, "visitors_announced_year": 2024}}, [plan])[0]["event"][
            "visitors_announced_year"
        ]
        == 2024
    )


# 관측 부적격과 발표 미연결을 우선순위로 나누어 한 입력을 한 번만 센다.
def test_diagnostics_partition(inputs: Inputs) -> None:
    rows = inputs.labels.to_dicts()
    rows[0]["label_tier"] = "silver"
    rows[1]["event_id"] = "missing"
    inputs.labels = pl.DataFrame(rows)
    result = i1.calculate(inputs, years=(2025,))
    diagnosis = json.loads(result["evidence"][0]["summary"])["comparisonDiagnostics"]
    assert diagnosis["stages"] == dict(
        eventMissing=1,
        observationIneligible=1,
        announcementMissing=1,
        conditionsMismatch=0,
        ambiguous=0,
        matched=0,
    )
    assert sum(diagnosis["stages"].values()) == diagnosis["labelRows"] == 3
    assert result["comparablePairs"] == 0


# 대상 연도만 확인돼도 기간·공간·발표일이 없으면 유효 비교로 승격하지 않는다.
def test_year_only_still_needs_metadata(inputs: Inputs) -> None:
    inputs.events = inputs.events.with_columns(pl.lit(2025).alias("visitors_announced_year"))
    result = i1.calculate(inputs, years=(2025,))
    diagnosis = json.loads(result["evidence"][0]["summary"])["comparisonDiagnostics"]
    assert diagnosis["stages"]["conditionsMismatch"] == 3
    assert diagnosis["stages"]["matched"] == 0
    assert len(diagnosis["followUp"]) == 3
    assert all(row["status"] == "conditionsMismatch" for row in diagnosis["followUp"])
