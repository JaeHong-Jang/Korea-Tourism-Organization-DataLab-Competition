"""기간·공간·발표 시점이 확인된 발표치와 일평균 실측의 비율만 집계한다."""

from typing import Any

import numpy as np
from crowdcast.analytics.insights.evidence import data_evidence, insight
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
        label.get("label_tier") not in GOLD
        or not label.get("is_primary")
        or label.get("definition") != "일평균"
        or label.get("time_unit") != "일"
        or label.get("spatial_scope") != "행사장"
        or label.get("kind") != "사후 집계"
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
def calculate(inputs: Inputs) -> dict[str, Any]:
    events = inputs.event_index()
    announcements: dict[tuple[Any, Any], list[dict[str, Any]]] = {}
    for event in events.values():
        if event.get("sigungu_code") and event.get("visitors_announced_year") is not None:
            announcements.setdefault((festival_key(event), event["visitors_announced_year"]), []).append(
                event
            )
    pairs, ratios, labels = [], [], []
    for label in inputs.labels.to_dicts():
        event = events.get(label["event_id"], {})
        if not event:
            continue
        candidates = announcements.get((festival_key(event), label.get("year")), [])
        matches = [
            (row, ratio)
            for row in candidates
            if (ratio := comparable(row, label, event)) is not None
            and day(row["visitors_announced_available_at"]) <= inputs.today
        ]
        if len(matches) == 1:
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
    content = {
        "rowsRead": inputs.plans.height,
        "formula": "같은 행사·연도·기간의 발표 누적 / 일수 / 실측 일평균",
        "q25": quantiles[0],
        "median": quantiles[1],
        "q75": quantiles[2],
        "comparablePairs": len(pairs),
        "candidates": inputs.labels.height,
        "excluded": inputs.labels.height - len(pairs),
        "note": "발표 시점·대상 연도·행사장·기간 누적 메타 미확인은 제외; 전년 수치를 당해와 비교하지 않음",
        "announcedAt": [str(row["visitors_announced_available_at"]) for row in pairs],
    }
    evidence = [
        data_evidence(
            inputs,
            PLANS,
            pairs,
            content,
            input_name="plans",
            used_period=period(pairs or inputs.plans.to_dicts(), inputs.today),
        )
    ]
    for tier, dataset in GOLD.items():
        selected = [row for row in labels if row["label_tier"] == tier]
        if selected:
            evidence.append(
                data_evidence(
                    inputs,
                    dataset,
                    selected,
                    {**content, "rowsRead": len(selected)},
                    input_name="labels",
                    used_period=period(pairs, inputs.today),
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
        "지자체 발표 vs 실측 괴리",
        quantiles[1] or 0,
        "배",
        text,
        pairs,
        series,
        evidence,
        pairs=len(pairs),
    )
