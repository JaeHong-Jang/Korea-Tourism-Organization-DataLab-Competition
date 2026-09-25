"""백테스트 행사 정의를 순간 최대 환산·판정 입력으로 옮긴다."""

from typing import Any


# 입력의 행사 정의를 기존 환산·판정 함수가 받는 필드로만 옮긴다.
def contract_event(event: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": event["event_id"],
        "type": event.get("type") or "기타",
        "startsAt": f"{event['start'].isoformat()}T00:00:00+09:00",
        "endsAt": f"{event['end'].isoformat()}T23:59:59+09:00",
        "timeOfDay": event.get("time_of_day") or "미상",
        "hazards": event.get("hazard_flags") or [],
    }
