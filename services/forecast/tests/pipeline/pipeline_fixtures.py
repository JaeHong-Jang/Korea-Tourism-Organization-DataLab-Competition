"""파이프라인의 합성 격자·저장 판정과 실행 기록 조회를 제공한다."""

import hashlib
import json
from datetime import date, timedelta
from pathlib import Path

import polars as pl

TODAY = date(2026, 9, 25)


# 날짜·지역별 세 방문자 구분을 갖춘 합성 격자를 만든다.
def region_frame(days: int = 2, latest: date = TODAY - timedelta(days=31)) -> pl.DataFrame:
    return pl.DataFrame(
        [
            {
                "sigungu_code": code,
                "date": latest - timedelta(days=offset),
                "tou_div": division,
                "visitors": 123.0,
            }
            for code in ("41800", "51150")
            for offset in range(days)
            for division in ("현지인", "외지인", "외국인")
        ]
    )


# T-103 저장 판정의 필수 필드만 사용해 파이프라인이 계산을 재구현하지 않게 한다.
def audit(labels: bytes) -> dict:
    return {
        "schema_version": 2,
        "labels_sha256": hashlib.sha256(labels).hexdigest(),
        "g0": {"decision": "simple", "gold_summary": {"gold_event_count": 5}},
        "silver": {
            "significant_negative": {"numerator": 9, "denominator": 259, "status": "pass"},
            "signal_retention": {"status": "pass"},
            "all_negative": {"status": "pass"},
            "unexpected_missing_snr_count": 0,
            "invalid_snr_count": 0,
            "zero_significant_count": 0,
        },
    }


# latest가 가리키는 기록을 실제 디스크에서 읽어 상태 전이와 계약을 검증한다.
def latest_record(root: Path) -> dict:
    runs = root / "reports/runs"
    latest = json.loads((runs / "latest.json").read_bytes())
    return json.loads((runs / latest["runId"] / "run.json").read_bytes())


# 단위가 일치하고 구간 재현에 성공한 영종 골든 사례를 만든다.
def golden_cases() -> list[dict]:
    return [
        {
            "eventId": "e-yeongjong-2025",
            "name": "영종 불꽃축제",
            "hostExpected": None,
            "model": {"p10": 10000, "p50": 20000, "p90": 30000, "unit": "명", "timeUnit": "순간"},
            "actual": {
                "id": "q-yeongjong-actual",
                "name": "보도 실제 인원",
                "value": 20000,
                "p10": None,
                "p50": None,
                "p90": None,
                "unit": "명",
                "timeUnit": "순간",
                "spatialScope": "행사장",
                "valueKind": "사후집계",
                "estimated": False,
                "assumptionIds": [],
                "announcedAt": "2025-10-19",
            },
            "unitsComparable": True,
            "verdict": "포함",
        }
    ]


# 표시 지표는 백분율로 고정해 비율과 %p를 섞지 않는다.
def backtest(mdape: float = 12.5, coverage: float = 80) -> dict:
    return {
        "runId": "backtest-2025",
        "modelRunId": "mr-2025",
        "modelVersion": "2025",
        "target": "일평균 방문객",
        "evalYears": [2025],
        "metrics": {
            "mdape": mdape,
            "coverage80": coverage,
            "coverageN": 10,
            "judgmentRecall": None,
            "judgmentPrecision": None,
            "baselineDeltaPp": None,
            "comparablePairs": 10,
        },
        "points": [],
        "golden": golden_cases(),
    }
