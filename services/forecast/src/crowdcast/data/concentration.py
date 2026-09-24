"""향후 관광지 집중률을 수집 시점과 추정 표시가 있는 실시간 참고 자료로 가져온다."""

from typing import Any

from crowdcast.data.call_ledger import korea_today
from crowdcast.data.datago_client import DataGoClient


# 과거 발행본을 복원할 수 없으므로 공개 시점은 캐시를 최초 수집한 시각이다.
def fetch_concentration(
    client: DataGoClient,
    *,
    area_code: str,
    sigungu_code: str,
    attraction_name: str | None = None,
) -> list[dict[str, Any]]:
    params = {"areaCd": area_code, "signguCd": sigungu_code}
    if attraction_name is not None:
        params["tAtsNm"] = attraction_name
    return [
        {
            **item,
            "available_at": page.fetched_at.isoformat(),
            "source_hash": page.source_hash,
            "estimated": True,
        }
        for page in client.pages("concentration", params, cache_scope=korea_today().isoformat())
        for item in page.items
    ]
