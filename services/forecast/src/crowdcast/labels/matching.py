"""T-102의 축제명·시도 정규화로 라벨 원본을 하나의 행사에만 연결한다."""

from collections import defaultdict
from typing import Any

from crowdcast.data.admin_dict import normalize_sido
from crowdcast.data.events import normalized_name


# 같은 이름·연도·시도의 복수 회차는 임의로 하나를 고르지 않는다.
class EventMatcher:
    # 원본과 마스터 양쪽에 동일한 정규화 규칙을 적용한다.
    def __init__(self, events: list[dict[str, Any]]) -> None:
        self.index: dict[tuple[str, int, str | None], list[dict[str, Any]]] = defaultdict(list)
        for event in events:
            key = (normalized_name(event["name"]), event["year"], normalize_sido(event["sido"]))
            self.index[key].append(event)

    # 미매칭 사유와 원본 위치를 함께 남겨 사람이 다음 재실행 전에 수정할 수 있게 한다.
    def match(
        self,
        name: str,
        year: int,
        sido: str | None,
        source_file: str,
        source_row: int,
        unmatched: list[dict[str, Any]],
    ) -> dict[str, Any] | None:
        region = normalize_sido(sido)
        candidates = self.index.get((normalized_name(name), year, region), []) if region else []
        if len(candidates) == 1:
            return candidates[0]
        reason = "시도 확인 불가" if not region else "복수 회차" if candidates else "이름·연도·시도 불일치"
        unmatched.append(
            {
                "festival_name": name,
                "year": year,
                "sido": sido,
                "reason": reason,
                "source_file": source_file,
                "source_row": source_row,
            }
        )
        return None
