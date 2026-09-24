"""직전 실버 QC의 필드와 집계를 검증하고 구버전 연도별 비교 기준을 복원한다."""

import hashlib
import io
import json
import re
from pathlib import Path
from typing import Any

import polars as pl
from crowdcast.labels.schema import DECIMALS
from crowdcast.labels.silver_signal import count_value, validate_population


# 저장된 비율은 분자·분모에서 다시 구해 숫자처럼 보이는 문자열이나 잘못된 합계를 거부한다.
def validate_ratio(check: Any, denominator: int) -> None:
    if not isinstance(check, dict):
        raise ValueError("직전 labels_g0.json의 비율 필드 오류")
    numerator = count_value(check["numerator"])
    if count_value(check["denominator"]) != denominator or numerator > denominator:
        raise ValueError("직전 labels_g0.json의 분자·분모 오류")
    expected = round(numerator / denominator, DECIMALS) if denominator else None
    if type(check["ratio"]) is not type(expected) or check["ratio"] != expected:
        raise ValueError("직전 labels_g0.json의 비율 오류")
    if check["status"] not in ("pass", "fail", "warn"):
        raise ValueError("직전 labels_g0.json의 status 오류")


# 구버전에는 연도별 유의 수가 없으므로 원래 Parquet의 해시·전체 집계가 맞을 때만 복원한다.
def legacy_population(previous: dict[str, Any], path: Path) -> None:
    raw = path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != previous["labels_sha256"]:
        raise ValueError("직전 labels_g0.json과 labels.parquet 해시 불일치 — 연도별 복원 불가")
    frame = pl.read_parquet(io.BytesIO(raw)).filter(pl.col("label_tier") == "silver")
    if frame.filter(pl.col("snr").abs() == 3).height:
        raise ValueError("구버전 SNR=±3 반올림 경계 — 직전 원래 유의 판정 복원 불가")
    if frame["event_id"].n_unique() != frame.height:
        raise ValueError("구버전 실버 event_id 중복")
    significant = frame.filter(pl.col("snr").abs() > 3)
    silver = previous["silver"]
    observed = (
        frame.height,
        significant.height,
        frame.filter(pl.col("daily_mean") < 0).height,
        significant.filter(pl.col("daily_mean") < 0).height,
        frame["snr"].null_count(),
    )
    expected = (
        silver["candidate_count"],
        silver["significant_count"],
        silver["all_negative"]["numerator"],
        silver["significant_negative"]["numerator"],
        silver["missing_snr_count"],
    )
    if observed != expected:
        raise ValueError("구버전 Parquet과 직전 QC 집계 불일치 — 연도별 복원 불가")
    silver["signal_by_year"] = [
        {
            "year": year,
            "candidate_count": frame.filter(pl.col("year") == year).height,
            "significant_count": significant.filter(pl.col("year") == year).height,
        }
        for year in sorted(frame["year"].unique())
    ]


# 버전 2도 덮어쓰기 전 직전 labels.parquet의 해시·연도별 유의 집계가 기록과 같을 때만 비교 기준으로 쓴다.
def verify_population(previous: dict[str, Any], path: Path) -> None:
    if not path.exists():
        raise ValueError("직전 labels.parquet 없음 — 직전 비교 기준 확인 불가")
    raw = path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != previous["labels_sha256"]:
        raise ValueError("직전 labels_g0.json과 labels.parquet 해시 불일치")
    frame = pl.read_parquet(io.BytesIO(raw)).filter(pl.col("label_tier") == "silver")
    # 저장된 SNR은 소수 여섯 자리 반올림이라 |SNR| = 3 경계 행은 원래 유의였을 수도 있어 범위로 대조한다.
    recorded = {row["year"]: row for row in previous["silver"]["signal_by_year"]}
    years = sorted(frame["year"].unique())
    if sorted(recorded) != years:
        raise ValueError("직전 labels.parquet과 labels_g0.json 연도 목록 불일치")
    for year in years:
        rows = frame.filter(pl.col("year") == year)
        low = rows.filter(pl.col("snr").abs() > 3).height
        high = rows.filter(pl.col("snr").abs() >= 3).height
        row = recorded[year]
        if row["candidate_count"] != rows.height or not low <= row["significant_count"] <= high:
            raise ValueError("직전 labels.parquet과 labels_g0.json 연도별 집계 불일치")


# 이전 판정을 신뢰하기 전에 버전·해시·카운트·비율의 타입과 상호 일치를 확인한다.
def read_previous(raw: bytes | None, labels_path: Path) -> dict[str, Any] | None:
    if raw is None:
        return None
    previous = json.loads(raw)
    if not isinstance(previous, dict) or type(previous.get("schema_version")) is not int:
        raise ValueError("직전 labels_g0.json의 schema_version 타입 오류")
    if previous["schema_version"] not in (1, 2):
        raise ValueError("직전 labels_g0.json의 schema_version 오류")
    for field in ("snapshot_sha256", "labels_sha256"):
        if not isinstance(previous[field], str) or not re.fullmatch("[0-9a-f]{64}", previous[field]):
            raise ValueError(f"직전 labels_g0.json의 {field} 오류")
    silver = previous["silver"]
    if not isinstance(silver, dict):
        raise ValueError("직전 labels_g0.json의 silver 필드 오류")
    candidates, significant = count_value(silver["candidate_count"]), count_value(silver["significant_count"])
    zero, missing = count_value(silver["zero_sigma_count"]), count_value(silver["missing_snr_count"])
    if not 0 <= significant <= candidates - missing or not 0 <= zero <= missing <= candidates:
        raise ValueError("직전 labels_g0.json의 유의 수·결측 수 오류")
    if count_value(silver["zero_significant_count"]) != int(significant == 0):
        raise ValueError("직전 labels_g0.json의 유의 신호 0건 검사 오류")
    validate_ratio(silver["all_negative"], candidates)
    validate_ratio(silver["significant_negative"], significant)
    if silver["significant_negative"]["numerator"] > silver["all_negative"]["numerator"]:
        raise ValueError("직전 labels_g0.json의 유의 음수 수 오류")

    # 구버전 절대 건수 판정은 비교에 사용하지 않되 저장된 숫자·타입 오류는 숨기지 않는다.
    if previous["schema_version"] == 1:
        check = silver["signal_retention"]
        if count_value(check["numerator"]) != significant or not isinstance(check["note"], str):
            raise ValueError("구버전 signal_retention 필드 오류")
        if check["denominator"] is None:
            if check["ratio"] is not None or check["status"] != "first_run":
                raise ValueError("구버전 첫 실행 판정 오류")
        else:
            denominator = count_value(check["denominator"])
            expected = round(significant / denominator, DECIMALS) if denominator else None
            if type(check["ratio"]) is not type(expected) or check["ratio"] != expected:
                raise ValueError("구버전 신호 유지 비율 오류")
            if check["status"] not in ("pass", "fail"):
                raise ValueError("구버전 신호 유지 status 오류")
        legacy_population(previous, labels_path)
    else:
        for field in ("unexpected_missing_snr_count", "invalid_snr_count"):
            if count_value(silver[field]) > candidates:
                raise ValueError(f"직전 labels_g0.json의 {field} 오류")
    validate_population(silver)
    if previous["schema_version"] == 2:
        verify_population(previous, labels_path)
    return previous
