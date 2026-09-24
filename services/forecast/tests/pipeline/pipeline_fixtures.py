"""파이프라인의 합성 격자·저장 판정과 실행 기록 조회를 제공한다."""

import hashlib
import json
import os
from datetime import date, datetime, timedelta
from pathlib import Path
from time import time_ns

import polars as pl
from crowdcast import paths
from crowdcast.data.call_ledger import KST

TODAY = date(2026, 9, 25)


# 실제 경계와 같은 2025 객체·코드 열로 수집 데이터와 독립된 합성 기준을 만든다.
def write_boundary(codes: tuple[str, ...] = ("41800", "51150")) -> Path:
    boundary = paths.EXTERNAL / "boundaries/sigungu.topo.json"
    boundary.parent.mkdir(parents=True, exist_ok=True)
    boundary.write_text(
        json.dumps(
            {
                "type": "Topology",
                "objects": {
                    "HangJeongDong_ver20251231": {
                        "type": "GeometryCollection",
                        "geometries": [{"properties": {"sgg": code}} for code in codes],
                    }
                },
            }
        )
    )
    return boundary


# 피처 모듈의 이번 산출물과 공개 시점 판정 파일을 함께 작성한다.
def write_features(audit: dict | None = None) -> None:
    region_frame().write_parquet(paths.PROCESSED / "features.parquet")
    (paths.PROCESSED / "features_availability.json").write_text(
        json.dumps(
            audit
            if audit is not None
            else {"checked": 12, "violations": 0, "asOfRule": "available_at <= as_of"}
        )
    )
    # 초고속 가짜 모듈의 mtime을 명시해 파일시스템 시계의 틱 단위에 테스트가 의존하지 않게 한다.
    for name in ("features.parquet", "features_availability.json"):
        written_ns = time_ns()
        os.utime(paths.PROCESSED / name, ns=(written_ns, written_ns))


# 백테스트 결과와 실행마다 달라지는 완료 표식을 별개 파일로 작성한다.
def write_backtest(current: dict | None = None) -> Path:
    current = current if current is not None else backtest()
    directory = paths.REPORTS / "backtest" / current["runId"]
    directory.mkdir(parents=True, exist_ok=True)
    summary = directory / "backtest.json"
    summary.write_text(json.dumps(current))
    # 실제 백테스트처럼 보고서·점수 파일도 함께 둔다(파이프라인은 세 파일을 모두 요구한다).
    (directory / "backtest.md").write_text("# 합성 백테스트\n", encoding="utf-8")
    pl.DataFrame({"eventId": ["e-yeoncheon-2025"]}).write_parquet(directory / "points.parquet")
    (directory.parent / "latest.json").write_text(
        json.dumps(
            {
                "runId": current["runId"],
                "modelVersion": current["modelVersion"],
                "finishedAt": datetime.now(KST).isoformat(),
            }
        )
    )
    return summary


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


# 계약 단위 그대로 — MdAPE는 %, 포함률은 비율(0~1).
def backtest(mdape: float = 12.5, coverage: float = 0.8) -> dict:
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


# 일괄 예보가 쓰는 모델: 계약 예시 카드를 그 버전 폴더에 두고 완료 포인터가 가리키게 한다.
def write_model() -> Path:
    fixture = paths.REPO_ROOT / "packages/contracts/fixtures/model-card/valid-v0-1-0.json"
    card = json.loads(fixture.read_bytes())
    directory = paths.MODELS / card["modelVersion"]
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "model_card.json").write_text(json.dumps(card))
    summary = backtest()
    summary["modelVersion"] = card["modelVersion"]
    write_backtest(summary)
    return directory / "model_card.json"
