"""공식 다운로드의 축제 누적 방문자를 I1에만 연결한다."""

import json
import math
from pathlib import Path


# 다운로드 검증을 통과한 원자료와 명시적인 행사 연결만 사용한다.
def load_datalab(path: Path, years: tuple[int, ...]) -> list[dict]:
    if not path.is_file():
        return []
    document = json.loads(path.read_text(encoding="utf-8"))
    if document.get("version") != 1:
        raise ValueError("I1 데이터랩 입력 버전 오류")
    seen = set()
    for row in document["rows"]:
        if (
            not row.get("eventId")
            or row["eventId"] in seen
            or type(row.get("year")) is not int
            or type(row.get("days")) is not int
            or row["days"] <= 0
            or not row.get("festival")
            or not row.get("region")
            or not row.get("sourceFile")
            or len(row.get("sha256", "")) != 64
            or not isinstance(row.get("total"), (int, float))
            or not math.isfinite(row["total"])
            or row["total"] < 0
        ):
            raise ValueError("I1 데이터랩 행사·수치·출처 오류")
        announced = row.get("announced")
        if announced and (
            announced.get("year") != row["year"]
            or not announced.get("sources")
            or not isinstance(announced.get("value"), (int, float))
            or not math.isfinite(announced["value"])
            or announced["value"] < 0
        ):
            raise ValueError("I1 데이터랩 발표 대상 연도·수치 오류")
        seen.add(row["eventId"])
    return [row for row in document["rows"] if row["year"] in years]


# 등록 일정과 관측 일수를 분리하고 기존 행사·예보 입력은 복제한다.
def attach_datalab(events: dict, rows: list[dict]) -> tuple[dict, list[dict], list[dict]]:
    result = {key: dict(value) for key, value in events.items()}
    public, reports = [], []
    for row in rows:
        identifier = row["eventId"]
        existing = result.get(identifier)
        if existing and existing["year"] != row["year"]:
            raise ValueError("I1 데이터랩 연결 행사 연도 불일치")
        result[identifier] = {
            **(existing or {}),
            "event_id": identifier,
            "name": row["festival"],
            "year": row["year"],
            "sigungu_name": row["region"],
            "start": existing.get("start") if existing else None,
            "end": existing.get("end") if existing else None,
            "date_basis": "데이터랩 개최연도·일수; 등록 일정 별도",
            "observation_period_label": f"{row['year']}년 · {row['days']}일",
        }
        scope = "축제 개최 행정동 · 현지인·외지인·외국인 합계"
        note = "행사·대상 연도 연결. CSV는 개최일수만 제공하며 발표 집계구역·중복 기준은 미확인."
        observed = {
            "value": row["total"],
            "unit": "명",
            "label": "데이터랩 축제기간 방문자 추정",
            "estimated": True,
        }
        source = {
            "title": "한국관광데이터랩 연도별 방문자 추이",
            "url": "https://datalab.visitkorea.or.kr/datalab/portal/fes/getFesDataForm.do",
            "file": row["sourceFile"],
        }
        reports.append(
            {
                "eventId": identifier,
                "year": row["year"],
                **observed,
                "from": None,
                "to": None,
                "days": row["days"],
                "scope": scope,
                "note": note,
                "title": source["title"],
                "url": source["url"],
                "page": row["sourceFile"],
                "periodLabel": result[identifier]["observation_period_label"],
            }
        )
        # 발표값은 대상 연도가 일치하는 단일 값이 확인된 경우에만 붙인다.
        announced = row.get("announced")
        if announced:
            same_value = announced["value"] == row["total"]
            public.append(
                {
                    "id": f"datalab-{identifier}",
                    "eventId": identifier,
                    "announced": {
                        "value": announced["value"],
                        "unit": "명",
                        "label": "개최계획 방문객 기재값",
                    },
                    "observed": observed,
                    "limitation": note
                    + (" 두 자료의 수치가 동일하며 독립 측정 여부는 미확인." if same_value else ""),
                    "sources": [
                        {"title": "문체부 지역축제 개최계획", "file": "; ".join(announced["sources"])},
                        source,
                    ],
                }
            )
    return result, public, reports
