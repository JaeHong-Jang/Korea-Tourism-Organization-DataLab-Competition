"""기존 이력 피처 생성기로 실제 사용한 전회차 사례를 식별한다."""

from datetime import date
from typing import Any

from crowdcast.api.assemble.inputs import feature_event, primary_labels
from crowdcast.features.history_features import festival_key, history_features


# 이력 피처가 값을 낸 전회차(공개된 골드 실측이 있는 직전 회차)만 식별한다 — 조회·예보가 같이 쓴다.
def previous_case_id(event: dict[str, Any], as_of: date) -> str | None:
    current = feature_event(event)
    events, labels = primary_labels(as_of)
    history = history_features(current, as_of, events, {row["event_id"]: row for row in labels})
    if not any(feature.value is not None for feature in history.values()):
        return None

    # 생성기가 채택한 유일한 직전 회차를 같은 축제·개최일 규칙으로 찾는다.
    previous = [
        row
        for row in events
        if row["event_id"] != current["event_id"]
        and festival_key(row) == festival_key(current)
        and row.get("start")
        and row["start"] < current["start"]
    ]
    return max(previous, key=lambda row: row["start"])["event_id"]
