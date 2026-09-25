"""통신 실패 시 같은 격자·구역의 검증된 기존 발표 캐시를 최신 수집 순으로 읽는다."""

import hashlib
import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from crowdcast.data.datago_client import DataGoError
from crowdcast.data.weather.cache import parse_bundle
from crowdcast.data.weather.client import result_dict, validate_base
from crowdcast.data.weather.mid_term import mid_records
from crowdcast.data.weather.normalize import api_time, as_kst, grid_records
from crowdcast.data.weather.transport import ENDPOINTS


# T-105의 메타데이터 없는 캐시도 원본 좌표나 중기 API의 최근 24시간 발표 해시로 식별한다.
def cache_params(envelope: dict[str, Any], api: str, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if "params" in envelope:
        return [envelope["params"]]
    if api in {"ultra_now", "short_term"}:
        row = rows[0]
        return [
            {
                "nx": int(row["nx"]),
                "ny": int(row["ny"]),
                "base_date": row["baseDate"],
                "base_time": row["baseTime"],
            }
        ]
    fetched = as_kst(envelope["fetched_at"]).replace(minute=0, second=0, microsecond=0)
    return [
        {
            "regId": rows[0]["regId"],
            "tmFc": (fetched - timedelta(days=day)).replace(hour=hour).strftime("%Y%m%d%H%M"),
        }
        for day in range(2)
        for hour in (6, 18)
    ]


# 캐시 이름까지 재검증해 다른 위치나 잘못된 발표 메타데이터를 재사용하지 않는다.
def cached_results(root: Path, api: str, location: dict[str, Any], before: datetime) -> list[dict[str, Any]]:
    found = []
    for path in (root / api).glob("*.json"):
        try:
            raw = path.read_bytes()
            pages = parse_bundle(raw)
            rows = [row for page in pages for row in page.items]
            for params in cache_params(json.loads(raw), api, rows):
                identity = json.dumps([ENDPOINTS[api], params], sort_keys=True).encode()
                if path.stem != hashlib.sha256(identity).hexdigest():
                    continue
                if any(params.get(key) != value for key, value in location.items()):
                    continue
                if api in {"ultra_now", "short_term"}:
                    issued = api_time(params["base_date"], params["base_time"])
                    validate_base(
                        issued, set(range(24)) if api == "ultra_now" else {2, 5, 8, 11, 14, 17, 20, 23}
                    )
                    records = grid_records(rows, **location, issued_at=issued, observed=api == "ultra_now")
                    result_location = location
                else:
                    issued = as_kst(datetime.strptime(params["tmFc"], "%Y%m%d%H%M"))
                    validate_base(issued, {6, 18})
                    records = mid_records(
                        rows,
                        region_code=location["regId"],
                        issued_at=issued,
                        temperature=api == "mid_temperature",
                    )
                    result_location = {"region_code": location["regId"]}
                if issued > before or not records:
                    continue
                snapshot = {
                    "records": records,
                    "source_hash": hashlib.sha256(raw).hexdigest(),
                    "fetched_at": as_kst(pages[0].fetched_at).isoformat(),
                    "source_url": f"https://apis.data.go.kr/{ENDPOINTS[api]}",
                }
                found.append(result_dict(snapshot, product=api, issued_at=issued, location=result_location))
        except (DataGoError, OSError, ValueError, KeyError, TypeError, IndexError, OverflowError):
            continue
    return sorted(found, key=lambda item: (as_kst(item["fetched_at"]), item["issued_at"]), reverse=True)
