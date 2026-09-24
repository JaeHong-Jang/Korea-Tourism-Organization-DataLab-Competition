"""TourAPI 행사·장소 검색을 수집 시점과 원본 근거 해시를 붙여 제공한다."""

from datetime import date
from typing import Any

from crowdcast.data.call_ledger import korea_today
from crowdcast.data.datago_client import DataGoClient


# 수정되는 관광정보를 날짜별 캐시로 가져오고 두 검색에서 같은 근거 규칙을 쓴다.
def _search(client: DataGoClient, api: str, params: dict[str, str]) -> list[dict[str, Any]]:
    return [
        {**item, "available_at": page.fetched_at.isoformat(), "source_hash": page.source_hash}
        for page in client.pages(api, params, cache_scope=korea_today().isoformat())
        for item in page.items
    ]


# 행사 시작일 범위로 searchFestival2를 조회한다.
def search_festivals(client: DataGoClient, start: date, end: date | None = None) -> list[dict[str, Any]]:
    if end is not None and end < start:
        raise ValueError("행사 종료 범위가 시작 범위보다 빠릅니다")
    params = {"eventStartDate": start.strftime("%Y%m%d"), "arrange": "A"}
    if end is not None:
        params["eventEndDate"] = end.strftime("%Y%m%d")
    return _search(client, "festivals", params)


# 키워드를 직접 인코딩하지 않고 공통 전송 계층에서 한 번만 인코딩한다.
def search_places(client: DataGoClient, keyword: str) -> list[dict[str, Any]]:
    if not keyword.strip():
        raise ValueError("장소 검색어가 필요합니다")
    return _search(client, "places", {"keyword": keyword, "arrange": "A"})
