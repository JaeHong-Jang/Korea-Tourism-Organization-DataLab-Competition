"""성공한 기존 API 캐시에서 실제 응답 행 수와 마지막 수집 시점을 읽는다."""

import json
from typing import Any

from crowdcast import paths
from crowdcast.analytics.insights.records import VISITORS, Inputs, day
from crowdcast.data.call_ledger import KST
from crowdcast.data.datago_client import DataGoClient
from crowdcast.data.weather.cache import parse_bundle

# 실제 캐시 디렉터리와 계약 데이터셋 사이의 고정 대응만 사용한다.
API_DATASETS = {
    "visitors": VISITORS,
    "festivals": "ds-kto-tourapi-15101578",
    "places": "ds-kto-tourapi-15101578",
    "holidays": "ds-kasi-holidays-15012690",
    "concentration": "ds-kto-concentration-15128555",
}


# 지역 방문자는 전처리의 원본 해시와 일치한 캐시만 수집일 증거로 인정한다.
def read_cache(inputs: Inputs) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    hashes = set(inputs.region["source_hash"].drop_nulls()) if "source_hash" in inputs.region else set()
    candidates = [
        (path, dataset, False)
        for api, dataset in API_DATASETS.items()
        for path in sorted((paths.CACHE / "datago" / api).glob("*.json"))
    ]
    candidates += [
        (path, "ds-kma-mid-15059468" if path.parent.name.startswith("mid") else "ds-kma-short-15084084", True)
        for path in sorted((paths.CACHE / "weather").glob("*/*.json"))
    ]
    for path, dataset, weather in candidates:
        raw = path.read_bytes()
        if weather:
            pages = parse_bundle(raw)
        else:
            envelope = json.loads(raw)
            body = envelope["payload"]["response"]["body"]
            pages = [DataGoClient._parse(raw, int(body["pageNo"]), max(1, int(body["numOfRows"])))]
        for page in pages:
            if not page.items or (dataset == VISITORS and page.source_hash not in hashes):
                continue
            stamp = page.fetched_at.astimezone(KST).date().isoformat()
            entry = result.setdefault(dataset, {"rowsRead": 0, "confirmedAt": stamp, "dates": []})
            entry["rowsRead"] += len(page.items)
            entry["confirmedAt"] = max(entry["confirmedAt"], stamp)
            for row in page.items:
                dates = [
                    day(row.get(key))
                    for key in (
                        "baseYmd",
                        "eventstartdate",
                        "eventenddate",
                        "locdate",
                        "baseDate",
                        "fcstDate",
                    )
                ]
                entry["dates"].extend(value.isoformat() for value in dates if value is not None)
            if dataset == VISITORS:
                inputs.confirmed["region"] = entry["confirmedAt"]
                inputs.collection_notes["region"] = (
                    "전처리 source_hash와 일치한 API 캐시 fetched_at의 마지막 수집일"
                )
    return result
