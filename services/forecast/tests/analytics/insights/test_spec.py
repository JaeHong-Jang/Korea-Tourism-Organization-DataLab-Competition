"""실제 읽은 데이터셋·수집일·인용 횟수만 활용 명세에 포함되는지 검사한다."""

import json
from hashlib import sha256
from pathlib import Path
from typing import Any

import polars as pl
from crowdcast import paths
from crowdcast.analytics.insights.collection import read_cache
from crowdcast.analytics.insights.records import PLANS, VISITORS, Inputs
from crowdcast.analytics.insights.spec import calculate
from crowdcast.api.contract import validate


# 공개 API의 성공한 녹화 응답과 수집 시각만 캐시에 기록한다.
def cache_page(api: str, items: list[dict[str, Any]], stamp: str = "2026-09-24T15:00:00+00:00") -> bytes:
    payload = {
        "response": {
            "header": {"resultCode": "0000"},
            "body": {"pageNo": 1, "numOfRows": 1000, "totalCount": len(items), "items": {"item": items}},
        }
    }
    content = json.dumps({"fetched_at": stamp, "payload": payload}).encode()
    path = paths.CACHE / "datago" / api / "recorded.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    return content


# 없는 API를 사용 목록에 넣지 않고 실제 표의 행 수와 예보 인용 횟수를 보존한다.
def test_only_read_tables_and_exact_citation_count(inputs: Inputs) -> None:
    for forecast in inputs.forecasts:
        forecast["evidence"] = [
            {"source": {"datasetId": VISITORS}},
            {"source": {"datasetId": VISITORS}},
            {"source": None},
        ]
    inputs.forecasts[0]["evidence"].append({"source": {"datasetId": PLANS}})
    result = calculate(inputs, read_cache(inputs))
    rows = {row["datasetId"]: row for row in result["rows"]}
    assert set(rows) == {VISITORS, PLANS, "ds-datalab-festival-status"}
    assert rows[VISITORS]["rowsRead"] == inputs.region.height
    assert rows[VISITORS]["evidenceCount"] == 6
    assert rows[PLANS]["evidenceCount"] == 1
    assert rows["ds-datalab-festival-status"]["evidenceCount"] == 0
    assert rows["ds-datalab-festival-status"]["period"] == {"from": "2025-07-05", "to": "2025-07-06"}
    assert rows[VISITORS]["datalabMenu"] is None
    assert "I4·I5" in rows[VISITORS]["purpose"]
    validate("datalab-spec", result)


# API 수집일은 캐시의 타임존을 한국 날짜로 바꾸고 전처리 해시 연결을 요구한다.
def test_collection_date_requires_source_hash(inputs: Inputs) -> None:
    raw = cache_page("visitors", [{"baseYmd": "20250705", "signguCode": "41800"}])
    assert read_cache(inputs) == {}
    inputs.region = inputs.region.with_columns(pl.lit(sha256(raw).hexdigest()).alias("source_hash"))
    cached = read_cache(inputs)
    assert cached[VISITORS]["confirmedAt"] == "2026-09-25"
    assert cached[VISITORS]["dates"] == ["2025-07-05"]
    assert inputs.confirmed["region"] == "2026-09-25"


# 특일·TourAPI는 실제 성공 응답이 있을 때만 명세에 기록하고 빈 응답은 제외한다.
def test_real_cached_api_only(inputs: Inputs) -> None:
    cache_page("festivals", [{"contentid": "1234", "eventstartdate": "20261003"}])
    cache_page("holidays", [{"locdate": "20261003", "dateName": "개천절"}])
    cache_page("concentration", [])
    result = calculate(inputs, read_cache(inputs))
    rows = {row["datasetId"]: row for row in result["rows"]}
    for dataset in ("ds-kto-tourapi-15101578", "ds-kasi-holidays-15012690"):
        assert rows[dataset]["rowsRead"] == 1
        assert rows[dataset]["confirmedAt"] == "2026-09-25"
        assert rows[dataset]["usedIn"] == ["M7-F2"]
    assert "ds-kto-concentration-15128555" not in rows
    validate("datalab-spec", result)


# 기상청은 빈 디렉터리·잠금 파일만으로 쓰인 자료가 되지 않고 응답 묶음이 있어야 한다.
def test_weather_requires_response(inputs: Inputs, insight_root: Path) -> None:
    directory = paths.CACHE / "weather" / "short"
    directory.mkdir(parents=True)
    (directory / "empty.lock").touch()
    assert read_cache(inputs) == {}
    body = {
        "pageNo": 1,
        "numOfRows": 1000,
        "totalCount": 1,
        "items": {"item": [{"baseDate": "20260925", "category": "POP", "fcstValue": "30"}]},
    }
    payload = {"response": {"header": {"resultCode": "00"}, "body": body}}
    (directory / "response.json").write_text(
        json.dumps({"fetched_at": "2026-09-25T08:00:00+09:00", "payloads": [payload]})
    )
    result = calculate(inputs, read_cache(inputs))
    weather = next(row for row in result["rows"] if row["datasetId"] == "ds-kma-short-15084084")
    assert weather["rowsRead"] == 1
    assert weather["period"]["from"] == "2026-09-25"
    validate("datalab-spec", result)
