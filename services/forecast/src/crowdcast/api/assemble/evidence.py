"""데이터·사례 근거의 출처와 값·단위를 내용 해시에 함께 묶는다."""

import json
from functools import lru_cache
from typing import Any

from crowdcast import paths
from crowdcast.api.assemble.identity import canonical, identifier

# 원본 종류와 등록된 데이터셋의 대응이며 피처 이름에는 의존하지 않는다.
SOURCES = {
    "silver": {
        "datasetId": "ds-kto-visitors-15101972",
        "title": "한국관광공사_빅데이터_지역별 방문자수_GW",
        "publisher": "한국관광공사",
        "datalabMenu": "빅데이터 > 지역별 방문자수(이동통신)",
        "accessUrl": "https://www.data.go.kr/data/15101972/openapi.do",
    },
    "goldA": {
        "datasetId": "ds-datalab-festival-status",
        "title": "데이터랩 문화관광축제 현황",
        "publisher": "한국관광공사",
        "datalabMenu": "축제 > 문화관광축제 현황",
        "accessUrl": "https://datalab.visitkorea.or.kr",
    },
    "goldB": {
        "datasetId": "ds-datalab-diy",
        "title": "데이터랩 행사·축제 DIY",
        "publisher": "한국관광공사",
        "datalabMenu": "축제 > 행사/축제 DIY",
        "accessUrl": "https://datalab.visitkorea.or.kr",
    },
    "announced": {
        "datasetId": "ds-mcst-festival-plans",
        "title": "문체부 지역축제 개최계획",
        "publisher": "문화체육관광부",
        "datalabMenu": None,
        "accessUrl": "https://www.mcst.go.kr",
    },
}


# 출처는 계약에 등록된 데이터셋만 허용한다.
@lru_cache(maxsize=1)
def datasets() -> set[str]:
    path = paths.REPO_ROOT / "packages/contracts/jsonld/master-ids.json"
    return set(json.loads(path.read_text(encoding="utf-8"))["datasets"])


# 알 수 없는 출처를 다른 데이터셋으로 대체하지 않는다.
def source(kind: str) -> dict[str, Any]:
    result = dict(SOURCES[kind])
    if result["datasetId"] not in datasets():
        raise ValueError("등록되지 않은 데이터셋")
    return result


# 구조화 값은 요약에도 보존해 계약에 없는 숫자 필드를 임의로 추가하지 않는다.
def fragment(kind: str, title: str, content: Any, **references: Any) -> dict[str, Any]:
    result = {
        "kind": kind,
        "title": title,
        "summary": canonical(content),
        "quantityIds": [],
        "period": None,
        "source": None,
        "availableAt": None,
        "ruleId": None,
        "clauseId": None,
        "caseEventId": None,
        "assumptionId": None,
        "forecastId": None,
        "modelVersion": None,
        "checkResult": None,
        **references,
    }
    return {"id": identifier("ev", result), **result}
