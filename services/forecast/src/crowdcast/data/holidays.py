"""특일 API의 공휴일을 조회하고 관측 가능한 최초 수집 시점을 보존한다."""

from typing import Any

from crowdcast.data.call_ledger import korea_today
from crowdcast.data.datago_client import DataGoClient


# 임시 공휴일의 실제 발표일을 추측하지 않고 수집 시점을 공개 시점으로 쓴다.
def fetch_holidays(client: DataGoClient, year: int, month: int | None = None) -> list[dict[str, Any]]:
    if not 1 <= year <= 9999 or (month is not None and not 1 <= month <= 12):
        raise ValueError("특일 조회 연도·월 범위 오류")
    params = {"solYear": str(year)}
    if month is not None:
        params["solMonth"] = f"{month:02d}"
    return [
        {**item, "available_at": page.fetched_at.isoformat(), "source_hash": page.source_hash}
        for page in client.pages("holidays", params, cache_scope=korea_today().isoformat())
        for item in page.items
    ]
