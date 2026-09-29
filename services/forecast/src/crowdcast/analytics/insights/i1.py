"""기간·공간·발표 시점이 확인된 발표치와 일평균 실측의 비율만 집계한다."""

from collections import Counter
from typing import Any

import numpy as np
from crowdcast import paths
from crowdcast.analytics.insights.evidence import data_evidence, insight
from crowdcast.analytics.insights.i1_announcements import restore_years
from crowdcast.analytics.insights.i1_coverage import announcement_coverage
from crowdcast.analytics.insights.i1_datalab import attach_datalab, load_datalab
from crowdcast.analytics.insights.i1_diagnostics import announcement_metadata, observation_ready
from crowdcast.analytics.insights.i1_inventory import I1_YEARS, collection_inventory
from crowdcast.analytics.insights.i1_observation_reports import observation_reports
from crowdcast.analytics.insights.i1_public_sources import load_public_comparisons
from crowdcast.analytics.insights.i1_reviewed_pairs import attach_reviewed, reviewed_pairs
from crowdcast.analytics.insights.records import GOLD, PLANS, Inputs, day, number, period
from crowdcast.features.history_features import festival_key
from crowdcast.models.baselines import announced_daily


# 발표의 대상 연도·기간·공간이 라벨과 같고 발표 시점이 기록된 쌍만 허용한다.
def comparable(
    event: dict[str, Any],
    label: dict[str, Any],
    observed: dict[str, Any] | None = None,
) -> float | None:
    observed = observed if observed is not None else event
    announced_at = day(event.get("visitors_announced_available_at"))
    start, end = day(event.get("visitors_announced_start")), day(event.get("visitors_announced_end"))
    if (
        not observation_ready(label)
        or event.get("visitors_announced_spatial_scope") != "행사장"
        or event.get("visitors_announced_time_unit") != "기간 누적"
        or event.get("visitors_announced_year") != label.get("year")
        or announced_at is None
        or start is None
        or end is None
        or end < start
        or announced_at < end
        or start != day(observed.get("start"))
        or end != day(observed.get("end"))
        or label.get("days") != (end - start).days + 1
        or (actual := number(label.get("daily_mean"))) is None
        or actual == 0
        or number(event.get("visitors_announced")) is None
    ):
        return None
    daily = announced_daily({"visitors_announced": event["visitors_announced"], "duration": label["days"]})
    return daily / actual


# T-203b의 나눗셈은 재사용하되 규모 대용치를 정의 일치 실측 쌍으로 승격하지 않는다.
def calculate(inputs: Inputs, *, years: tuple[int, ...] = I1_YEARS) -> dict[str, Any]:
    events, restored = restore_years(inputs.event_index(), inputs.plans.to_dicts())
    selected_events = [
        row
        for row in events.values()
        if row.get("year") in years and day(row.get("end")) and day(row["end"]) < inputs.today
    ]
    selected_ids = {row["event_id"] for row in selected_events}
    candidate_labels = [
        row
        for row in inputs.labels.to_dicts()
        if row.get("year") in years and (row["event_id"] not in events or row["event_id"] in selected_ids)
    ]
    selected_period = {
        "from": f"{min(years)}-01-01",
        "to": min(f"{max(years)}-12-31", inputs.today.isoformat()),
    }
    announcements: dict[tuple[Any, Any], list[dict[str, Any]]] = {}
    for event in events.values():
        if event.get("sigungu_code") and event.get("visitors_announced_year") in years:
            announcements.setdefault((festival_key(event), event["visitors_announced_year"]), []).append(
                event
            )
    pairs, ratios, labels, follow_up = [], [], [], []
    # 최초로 막힌 단계 하나만 기록해 제외 건수가 중복 합산되지 않게 한다.
    stages: Counter[str] = Counter()
    for label in candidate_labels:
        event = events.get(label["event_id"], {})
        if not event:
            stages["eventMissing"] += 1
            continue
        if not observation_ready(label):
            stages["observationIneligible"] += 1
            continue
        candidates = announcements.get((festival_key(event), label.get("year")), [])
        if not candidates:
            stages["announcementMissing"] += 1
            follow_up.append(
                {
                    "eventName": event["name"],
                    "festivalKey": list(festival_key(event)),
                    "year": label["year"],
                    "status": "announcementMissing",
                }
            )
            continue
        matches = [
            (row, ratio)
            for row in candidates
            if (ratio := comparable(row, label, event)) is not None
            and day(row["visitors_announced_available_at"]) <= inputs.today
        ]
        if len(matches) == 1:
            stages["matched"] += 1
            announcement, ratio = matches[0]
            pairs.append(
                {
                    **event,
                    **{
                        key: value
                        for key, value in announcement.items()
                        if key.startswith("visitors_announced")
                    },
                }
            )
            labels.append(label)
            ratios.append(ratio)
        else:
            stages["ambiguous" if len(matches) > 1 else "conditionsMismatch"] += 1
            follow_up.append(
                {
                    "eventName": event["name"],
                    "festivalKey": list(festival_key(event)),
                    "year": label["year"],
                    "status": "ambiguous" if len(matches) > 1 else "conditionsMismatch",
                }
            )
    quantiles = np.quantile(ratios, [0.25, 0.5, 0.75]).tolist() if ratios else [None, None, None]
    bins = [
        ("1배 미만", 0, 1),
        ("1~2배 미만", 1, 2),
        ("2~5배 미만", 2, 5),
        ("5~10배 미만", 5, 10),
        ("10배 이상", 10, float("inf")),
    ]
    series = [
        {"label": label, "value": sum(low <= value < high for value in ratios)} for label, low, high in bins
    ]
    public = load_public_comparisons(paths.PROCESSED / "insight_public_comparisons.json", inputs.today)
    reports = observation_reports(paths.PROCESSED / "insight_observation_reports.json", inputs.today, events)
    public = [row for row in public if row["year"] in years]
    reports = [row for row in reports if row["year"] in years]
    reviewed = [
        row
        for row in reviewed_pairs(paths.PROCESSED / "insight_reviewed_pairs.json", inputs.today)
        if row["year"] in years
    ]
    inventory_events, reviewed_public, reviewed_reports = attach_reviewed(events, reviewed)
    inventory_events, datalab_public, datalab_reports = attach_datalab(
        inventory_events, load_datalab(paths.PROCESSED / "insight_datalab_observations.json", years)
    )
    content = {
        "publicComparisons": public,
        "collectionInventory": collection_inventory(
            inputs,
            inventory_events,
            public + reviewed_public + datalab_public,
            {row["event_id"] for row in pairs},
            reports + reviewed_reports + datalab_reports,
            years,
        ),
        "rowsRead": inputs.plans.height,
        "formula": "같은 행사·연도·기간의 발표 누적 / 일수 / 실측 일평균",
        "q25": quantiles[0],
        "median": quantiles[1],
        "q75": quantiles[2],
        "comparablePairs": len(pairs),
        "candidates": len(candidate_labels),
        "excluded": len(candidate_labels) - len(pairs),
        "analysisPeriod": selected_period,
        "note": "발표 시점·대상 연도·행사장·기간 누적 메타 미확인은 제외; 전년 수치를 당해와 비교하지 않음",
        "announcedAt": [str(row["visitors_announced_available_at"]) for row in pairs],
        "comparisonDiagnostics": {
            "pastAnnouncementCoverage": announcement_coverage(inputs.forecasts, events, announcements),
            "version": 1,
            "labelRows": len(candidate_labels),
            "restoredAnnouncementYears": restored,
            "followUp": follow_up,
            "stages": {
                key: stages[key]
                for key in (
                    "eventMissing",
                    "observationIneligible",
                    "announcementMissing",
                    "conditionsMismatch",
                    "ambiguous",
                    "matched",
                )
            },
            **announcement_metadata(selected_events),
            "periodMeaning": "matched_events" if pairs else "input_schedule_only",
        },
    }
    evidence = [
        data_evidence(
            inputs,
            PLANS,
            pairs,
            content,
            input_name="plans",
            used_period=period(pairs, inputs.today) if pairs else selected_period,
        )
    ]
    for tier, dataset in GOLD.items():
        selected = [row for row in labels if row["label_tier"] == tier]
        # 비교가 성립하지 않아도 점검한 관측 자료의 출처를 숨기지 않는다.
        if not selected:
            selected = [row for row in candidate_labels if row.get("label_tier") == tier]
        if selected:
            evidence.append(
                data_evidence(
                    inputs,
                    dataset,
                    selected,
                    {
                        **{key: value for key, value in content.items() if key != "collectionInventory"},
                        "rowsRead": len(selected),
                        "usage": "비교 후보의 관측 자료 확인",
                    },
                    input_name="labels",
                    used_period=period(
                        [events[row["event_id"]] for row in selected if row["event_id"] in events],
                        inputs.today,
                    ),
                )
            )
    text = (
        (
            f"정의 일치 {len(pairs)}쌍, 발표/실측 중앙값 {quantiles[1]:.2f}배; "
            f"사분위 {quantiles[0]:.2f}~{quantiles[2]:.2f}배"
        )
        if pairs
        else ("발표 시점·대상 연도·공간·기간이 모두 확인된 비교쌍이 없습니다")
    )
    return insight(
        inputs,
        "I1",
        "발표 방문객 수와 관측값 비교",
        quantiles[1] or 0,
        "배",
        text,
        pairs,
        series,
        evidence,
        pairs=len(pairs),
        used_period=selected_period,
    )
