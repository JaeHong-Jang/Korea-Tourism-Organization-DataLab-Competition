"""같은 축제의 직전 회차 중 공개가 끝난 대표 실측만 이력으로 연결한다."""

import re
import unicodedata
from datetime import date
from typing import Any

from crowdcast.features.availability import Feature, publication_date

# 행사장 방문객을 직접 센 정답 등급(데이터랩 축제 현황·DIY).
GOLD_TIERS = frozenset({"goldA", "goldB"})
# 골드 등급별 출처 데이터셋(master-ids).
GOLD_DATASETS = {"goldA": "ds-datalab-festival-status", "goldB": "ds-datalab-diy"}


# 회차·연도 표기를 제거한 이름과 지역이 같은 행사만 연결하고 유사 이름은 추측하지 않는다.
def festival_key(event: dict[str, Any]) -> tuple[str, str | None]:
    name = unicodedata.normalize("NFKC", event["name"]).lower()
    name = re.sub(r"제\s*\d+\s*회", "", name)
    name = re.sub(r"(?<!\d)(?:19|20)\d{2}\s*년?", "", name)
    return re.sub(r"[^가-힣a-z0-9]", "", name), event.get("sigungu_code")


# 평가 행사 자체와 골든 행사는 어느 출처에서도 이력 피처가 될 수 없다.
def history_features(
    event: dict[str, Any],
    as_of: date,
    events: list[dict[str, Any]],
    labels: dict[str, dict[str, Any]],
) -> dict[str, Feature]:
    result = {"previous_daily_mean": Feature(None, None)}
    previous = [
        row
        for row in events
        if row["event_id"] != event["event_id"]
        and festival_key(row) == festival_key(event)
        and row.get("start")
        and row["start"] < event["start"]
    ]
    if not previous or not event.get("sigungu_code"):
        return result
    latest = max(row["start"] for row in previous)
    candidates = [row for row in previous if row["start"] == latest]
    if len(candidates) != 1:
        return result
    prior = candidates[0]
    label = labels.get(prior["event_id"])
    if prior.get("is_golden") or label is None:
        return result
    # 전회차 실측은 골드만 쓴다(06 §3) — 실버 시군구 순증은 정의가 달라 전회차 실측·B1로 쓰지 않는다.
    available = publication_date(label.get("available_at"))
    if (
        label["label_tier"] not in GOLD_TIERS
        or (label["label_tier"] == "goldB" and label.get("spatial_scope") != "행사장")
        or not label["is_primary"]
        or not label["usable_for_training"]
        or label["is_golden"]
        or available is None
        or available > as_of
    ):
        return result
    result["previous_daily_mean"] = Feature(
        float(label["daily_mean"]),
        available,
        dataset_id=GOLD_DATASETS[label["label_tier"]],
        sigungu_code=prior.get("sigungu_code"),
        observed_at=prior.get("end") or prior["start"],
        unit="명/일",
    )
    return result
