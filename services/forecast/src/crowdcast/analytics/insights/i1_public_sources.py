"""출처를 검토한 공개 수치 대조 사례를 확정 비교쌍과 분리해 읽는다."""

import json
import math
from datetime import date
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


# 미래 자료·출처 없는 값·다른 단위를 비율로 변환한 자료는 발행하지 않는다.
def load_public_comparisons(path: Path, today: date) -> list[dict[str, Any]]:
    if not path.is_file():
        return []
    document = json.loads(path.read_text(encoding="utf-8"))
    if document.get("version") != 1 or not isinstance(document.get("rows"), list):
        raise ValueError("공개 비교 자료 형식 오류")
    result = []
    seen = set()
    for row in document["rows"]:
        if (
            not isinstance(row.get("id"), str)
            or row["id"] in seen
            or type(row.get("year")) is not int
            or not 1 <= row["year"] <= today.year
            or not row.get("eventName")
            or not row.get("periodLabel")
            or not row.get("limitation")
            or row.get("status") != "conditions_unverified"
            or date.fromisoformat(row["checkedAt"]) > today
            or date.fromisoformat(row["eventEndedAt"]) >= today
            or date.fromisoformat(row["eventEndedAt"]).year != row["year"]
        ):
            raise ValueError("공개 비교 자료 대상·확인일 오류")
        for key in ("announced", "observed"):
            value = row[key]
            if (
                type(value.get("value")) not in (int, float)
                or not math.isfinite(value["value"])
                or value["value"] < 0
                or value.get("unit") not in ("명", "매")
                or not isinstance(value.get("approximate"), bool)
                or not value.get("label")
            ):
                raise ValueError("공개 비교 자료 수치·단위 오류")
        if not row.get("sources") or len(row["sources"]) < 2:
            raise ValueError("공개 비교 자료 출처 부족")
        for source in row["sources"]:
            if not source.get("title") or not (source.get("url") or source.get("file")):
                raise ValueError("공개 비교 자료 출처 누락")
            if source.get("url"):
                parsed = urlparse(source["url"])
                if parsed.scheme != "https" or not parsed.netloc:
                    raise ValueError("공개 비교 자료 출처 주소 오류")
            if source.get("publishedAt") and date.fromisoformat(source["publishedAt"]) > today:
                raise ValueError("미래 공개 자료 포함")
        # 수치가 양쪽에 있어도 집계 정의가 확인되기 전에는 비율이나 유효 표본을 만들지 않는다.
        result.append({**row, "ratio": None})
        seen.add(row["id"])
    return sorted(result, key=lambda row: (row["year"], row["eventName"]))
