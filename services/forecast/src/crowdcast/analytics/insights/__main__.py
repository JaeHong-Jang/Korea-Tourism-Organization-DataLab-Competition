"""보유 자료만으로 인사이트 여섯 개와 활용 명세를 계산·검증·발행한다."""

import json
from pathlib import Path
from typing import Any

from crowdcast import paths
from crowdcast.analytics.insights import i1, i2, i3, i4, i5, i6, regional_pairs, spec
from crowdcast.analytics.insights.collection import read_cache
from crowdcast.analytics.insights.records import Inputs, load
from crowdcast.analytics.insights.storage import publish
from crowdcast.data.call_ledger import file_lock


# 두 지역 지표의 비교 표본을 한 번만 계산해 분모와 제외 기준을 일치시킨다.
def calculate(inputs: Inputs, cached: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
    pairs = regional_pairs.calculate(inputs)
    results = [
        i1.calculate(inputs),
        i2.calculate(inputs),
        i3.calculate(inputs),
        i4.calculate(inputs, pairs),
        i5.calculate(inputs, pairs),
        i6.calculate(inputs),
    ]
    return {**{item["key"]: item for item in results}, "datalab-spec": spec.calculate(inputs, cached)}


# CLI와 파이프라인이 같은 쓰기 잠금과 발행 경로를 사용한다.
def run() -> list[Path]:
    paths.PROCESSED.mkdir(parents=True, exist_ok=True)
    with file_lock(paths.PROCESSED / ".insights.lock"):
        inputs = load()
        cached = read_cache(inputs)
        outputs = calculate(inputs, cached)
        files = publish(outputs)
    for key, result in outputs.items():
        summary = (
            {"key": key, "rows": len(result["rows"])}
            if key == "datalab-spec"
            else {name: result[name] for name in ("key", "sampleSize", "comparablePairs", "headline")}
        )
        print(json.dumps(summary, ensure_ascii=False))
    return files


# python -m 호출에서 계산 실패를 종료 코드로 전달한다.
if __name__ == "__main__":
    run()
