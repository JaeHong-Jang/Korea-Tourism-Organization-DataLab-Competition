"""수집 격자·신선도·공유 장부와 저장된 라벨·후속 단계 결과를 판정한다."""

import csv
import hashlib
import json
from collections.abc import Iterable
from datetime import date
from pathlib import Path
from typing import Any

import polars as pl
from crowdcast import paths
from crowdcast.api.contract import validate
from crowdcast.data.call_ledger import DAILY_LIMIT
from crowdcast.data.crosswalk import CODE_CHANGE_DATE, INCHEON_BREAK_CODES, PARENT_CITY_CODES
from crowdcast.data.visitors import TOU_DIV
from crowdcast.pipeline.run_record import model_directory, sha256

# T-203 학습 산출물 — 분위수(p10·p50·p90) LightGBM 모델 파일.
REQUIRED_MODEL_FILES = ("p10.txt", "p50.txt", "p90.txt")


# 손상된 장부를 0건으로 취급하지 않고 모든 행의 날짜·횟수를 검증한다.
def ledger_calls(today: date) -> int:
    ledger = paths.CACHE / "datago/ledger.csv"
    if not ledger.exists():
        return 0
    with ledger.open(newline="", encoding="utf-8") as stream:
        reader = csv.DictReader(stream)
        if reader.fieldnames != ["date", "api", "calls"]:
            raise ValueError("호출 장부 열 오류")
        total = 0
        for row in reader:
            day, calls = date.fromisoformat(row["date"]), int(row["calls"])
            if day.isoformat() != row["date"] or calls < 1 or not row["api"] or None in row:
                raise ValueError("호출 장부 행 오류")
            total += calls if day == today else 0
    return total


# 코드 집합을 순서와 무관하게 하나의 해시로 만든다.
def code_set_sha256(codes: Iterable[str]) -> str:
    return hashlib.sha256(",".join(sorted(set(codes))).encode()).hexdigest()


# 2025 경계 정본 시군구 수와 방문자 API 부모 시 수(06 §1·T-102) — 경계가 일부면 분모가 줄어 결측을 숨긴다.
EXPECTED_BOUNDARY_CODES: int | None = 252
EXPECTED_PARENT_CITIES: int | None = 12
# 정본 코드 집합 자체를 대조한다(개수만 맞춘 바뀐 목록을 막는다) — 정렬한 코드를 쉼표로 이은 SHA-256.
EXPECTED_BOUNDARY_SHA256: str | None = "060a6c45d9e798514faa5976d776a63983e8bb73b131206be5c3c0a1b849c189"
EXPECTED_PARENT_SHA256: str | None = "d61cff70337a966e77544ff14ed6b33245a285f54214c2a221c34fe52702e63a"


# 수집 산출물과 독립된 2025 경계 정본에 기존 방문자 API 부모 시 정의만 더한다.
def visitor_codes() -> pl.DataFrame:
    boundary = paths.EXTERNAL / "boundaries/sigungu.topo.json"
    topology = json.loads(boundary.read_bytes())
    collection = topology.get("objects", {}).get("HangJeongDong_ver20251231", {})
    if topology.get("type") != "Topology" or collection.get("type") != "GeometryCollection":
        raise ValueError("방문자 기준 경계는 2025년 ver20251231 Topology여야 합니다")
    codes = [row.get("properties", {}).get("sgg") for row in collection.get("geometries", [])]
    if not codes or any(
        not isinstance(code, str) or len(code) != 5 or not code.isascii() or not code.isdigit()
        for code in codes
    ):
        raise ValueError("방문자 기준 경계의 시군구 코드 누락·형식 오류")
    if len(codes) != len(set(codes)):
        raise ValueError("방문자 기준 경계의 시군구 코드 중복")
    # 기준 목록이 빠짐없는지 정본 수로 확인한다(일부만 있는 경계는 기준으로 쓰지 않는다).
    if EXPECTED_BOUNDARY_CODES is not None and len(codes) != EXPECTED_BOUNDARY_CODES:
        raise ValueError(f"방문자 기준 경계 시군구 {len(codes)}개 — 정본 {EXPECTED_BOUNDARY_CODES}개와 다름")
    if EXPECTED_PARENT_CITIES is not None and len(PARENT_CITY_CODES) != EXPECTED_PARENT_CITIES:
        raise ValueError(f"부모 시 {len(PARENT_CITY_CODES)}개 — 정본 {EXPECTED_PARENT_CITIES}개와 다름")
    if EXPECTED_BOUNDARY_SHA256 is not None and code_set_sha256(codes) != EXPECTED_BOUNDARY_SHA256:
        raise ValueError("방문자 기준 경계 코드 집합이 정본과 다름(해시 불일치)")
    if EXPECTED_PARENT_SHA256 is not None and code_set_sha256(PARENT_CITY_CODES) != EXPECTED_PARENT_SHA256:
        raise ValueError("부모 시 코드 집합이 정본과 다름(해시 불일치)")
    return pl.DataFrame({"sigungu_code": sorted(set(codes) | PARENT_CITY_CODES)})


# 고정 기준 지역과 연속 날짜로 전체 누락까지 분모에 남긴다.
def fetch_gate(today: date, start: date | None = None, codes: pl.DataFrame | None = None) -> dict[str, Any]:
    codes = visitor_codes() if codes is None else codes
    output = paths.PROCESSED / "region_daily.parquet"
    frame = pl.read_parquet(output)
    if frame.is_empty():
        return {"passed": False, "message": "region_daily가 비어 있습니다"}
    if frame.select(pl.any_horizontal(pl.col("date", "sigungu_code", "tou_div").is_null()).any()).item():
        return {"passed": False, "message": "region_daily 격자 키 결측"}
    first, latest = frame["date"].min(), frame["date"].max()
    first = min(first, start) if start else first
    checkpoint = output.with_suffix(".progress.json")
    if checkpoint.exists():
        progress = json.loads(checkpoint.read_bytes())
        if progress["parquet_sha256"] != sha256(output):
            return {"passed": False, "message": "region_daily 체크포인트 해시 불일치"}
        first = min([first, *(date.fromisoformat(day) for day in progress["completed_dates"])])

    # 결측률 = ((2025 경계 ∪ API 부모 시) × 첫날~최신일 × 세 구분 − 유효 칸) / 전체 칸.
    # 부모 시도 포함하며 2026-07-01 이후 인천 단절 지역만 분자·분모에서 함께 제외한다.
    days = pl.DataFrame({"date": pl.date_range(first, latest, eager=True)})
    grid = codes.join(days, how="cross").filter(
        ~((pl.col("date") >= CODE_CHANGE_DATE) & pl.col("sigungu_code").is_in(INCHEON_BREAK_CODES))
    )
    expected = grid.height * len(TOU_DIV)
    if not expected:
        return {"passed": False, "message": "방문자 기준 격자가 비어 있습니다"}
    valid = (
        frame.join(grid, on=["sigungu_code", "date"], how="semi")
        .filter(pl.col("tou_div").is_in(list(TOU_DIV.values())))
        .group_by("sigungu_code", "date", "tou_div")
        .agg(
            (pl.col("visitors").is_not_null() & pl.col("visitors").is_finite() & (pl.col("visitors") >= 0))
            .all()
            .alias("valid"),
            pl.len().alias("rows"),
        )
        .filter(pl.col("valid") & (pl.col("rows") == 1))
        .height
    )
    missing = expected - valid
    lag = (today - latest).days
    calls = ledger_calls(today)
    passed = missing * 50 < expected and 0 <= lag <= 35 and calls <= DAILY_LIMIT
    return {
        "passed": passed,
        "message": (
            f"시군구×전체 날짜×세 구분 격자 {first}~{latest} 결측 "
            f"{missing}/{expected}={missing / expected:.6%} (<2%); "
            f"최신 관측일 {latest}; 실제 반영 지연={lag}일 (실행일 {today}, 0~35일); "
            f"{'반영 지연 가정 위반; ' if lag > 35 else ''}공유 장부 {calls}/{DAILY_LIMIT}건"
        ),
    }


# T-103이 기록한 판정과 해시만 읽으며 부호·골든·G0 표본을 다시 계산하지 않는다.
def labels_gate() -> dict[str, Any]:
    audit = json.loads((paths.PROCESSED / "labels_g0.json").read_bytes())
    if type(audit["schema_version"]) is not int or audit["schema_version"] != 2:
        raise ValueError("labels_g0.json 버전 2가 필요합니다")
    if audit["labels_sha256"] != sha256(paths.PROCESSED / "labels.parquet"):
        return {"passed": False, "message": "labels_g0.json과 labels.parquet 해시 불일치"}
    silver, g0 = audit["silver"], audit["g0"]
    checks = {key: silver[key]["status"] for key in ("significant_negative", "signal_retention")}
    if any(value not in {"pass", "fail"} for value in checks.values()):
        raise ValueError("라벨 저장 판정 오류")
    errors = {
        key: silver[key]
        for key in ("unexpected_missing_snr_count", "invalid_snr_count", "zero_significant_count")
    }
    if any(type(value) is not int or value < 0 for value in errors.values()):
        raise ValueError("라벨 저장 오류 건수 형식 오류")
    if g0["decision"] not in {"simple", "partial", "planned"}:
        raise ValueError("G0 분기 오류")
    warning = silver["all_negative"]["status"]
    if warning not in {"pass", "warn"}:
        raise ValueError("전체 음수 경고 판정 오류")
    negative = silver["significant_negative"]
    message = (
        f"T-103 저장 판정: G0={g0['decision']}, 골드={g0['gold_summary']['gold_event_count']}; "
        f"유의 음수={negative['numerator']}/{negative['denominator']} ({checks['significant_negative']}); "
        f"신호 유지={checks['signal_retention']}; 오류 건수={errors}; 전체 음수={warning}"
    )
    return {
        "passed": all(value == "pass" for value in checks.values()) and not any(errors.values()),
        "message": message,
    }


# 기존 결과를 실행 전에 읽어 백테스트·일괄 예보의 비교 기준을 보존한다(백테스트는 완료 포인터가 가리킨 결과).
def previous_result(stage: str) -> Any:
    if stage == "backtest":
        pointer = paths.REPORTS / "backtest/latest.json"
        if pointer.is_file():
            summary = pointer.parent / json.loads(pointer.read_bytes())["runId"] / "backtest.json"
            return json.loads(summary.read_bytes()) if summary.is_file() else None
    if stage == "batch" and (paths.PROCESSED / "upcoming.parquet").exists():
        return pl.scan_parquet(paths.PROCESSED / "upcoming.parquet").select(pl.len()).collect().item()
    return None


# 후속 모듈의 검증 종료 코드 외에 저장 산출물과 단계 간 비교 게이트를 확인한다.
def optional_gate(stage: str, files: list[Path], previous: Any) -> dict[str, Any]:
    if stage == "features":
        audit_path = paths.PROCESSED / "features_availability.json"
        if not audit_path.is_file():
            return {"passed": False, "message": "features_availability.json 없음"}
        audit = json.loads(audit_path.read_bytes())
        if (
            any(type(audit[k]) is not int or audit[k] < 0 for k in ("checked", "violations"))
            or not isinstance(audit["asOfRule"], str)
            or not audit["asOfRule"].strip()
            or audit["violations"] > audit["checked"]
        ):
            raise ValueError("피처 공개 시점 검사 결과 형식 오류")
        return {
            "passed": audit["checked"] > 0 and audit["violations"] == 0,
            "message": f"공개 시점 검사 checked={audit['checked']}, violations={audit['violations']}; "
            f"asOfRule={audit['asOfRule']}",
        }
    if not files:
        return {"passed": False, "message": f"{stage} 산출물 없음"}
    if stage == "train":
        directory = model_directory()
        if directory is None or not (directory / "model_card.json").is_file():
            return {"passed": False, "message": "완료 포인터가 가리키는 모델 카드 없음"}
        card = json.loads((directory / "model_card.json").read_bytes())
        validate("model-card", card)
        if card["modelVersion"] != directory.name:
            return {"passed": False, "message": "모델 카드 버전과 완료 포인터의 modelVersion 불일치"}
        # 분위수 모델 세 파일이 각각 이번 버전 폴더에 있어야 학습 산출물로 인정한다.
        saved = all(directory / name in files for name in REQUIRED_MODEL_FILES)
        return {"passed": saved, "message": f"학습 모듈 종료 코드 0; 모델 카드 계약 통과; 모델 파일={saved}"}
    if stage == "batch":
        count = pl.scan_parquet(paths.PROCESSED / "upcoming.parquet").select(pl.len()).collect().item()
        warning = previous is not None and count * 10 < previous * 9
        return {
            "passed": True,
            "message": f"예보 수={count}, 직전={previous}; "
            + ("경고: 직전 90% 미만 (중단하지 않음)" if warning else "예보 수 게이트 통과"),
        }

    # 계약 단위: MdAPE는 %, 포함률은 비율(0~1) — 허용 폭도 각 단위로 비교한다(+3%p, -0.05).
    current = json.loads(
        max(
            (p for p in files if p.name == "backtest.json"), key=lambda path: path.stat().st_mtime_ns
        ).read_bytes()
    )
    validate("backtest-summary", current)
    if not current["golden"]:
        return {"passed": None, "message": "골든 결과 0건: 미검증; 모델 승격 보류"}
    # 골든 ID만 남아 있어도 단위가 맞는 실제 재현 판정이 실패하면 승격을 막는다.
    golden = all(
        row["verdict"] == ("포함" if row["unitsComparable"] else "정성 비교") for row in current["golden"]
    )
    if previous is None:
        return {
            "passed": golden,
            "message": f"첫 백테스트 계약 통과; 직전 비교 없음; "
            f"골든 결과 {len(current['golden'])}건; 재현 판정={golden}",
        }
    validate("backtest-summary", previous)
    old, new = previous["metrics"], current["metrics"]
    golden = golden and {row["eventId"] for row in previous["golden"]} <= {
        row["eventId"] for row in current["golden"]
    }
    passed = new["mdape"] <= old["mdape"] + 3 and new["coverage80"] >= old["coverage80"] - 0.05
    return {
        "passed": passed and golden,
        "message": f"MdAPE={new['mdape']}% (직전 {old['mdape']}% +3%p); "
        f"포함률={new['coverage80'] * 100:.1f}% (직전 {old['coverage80'] * 100:.1f}% -5%p); "
        f"골든 재현={golden}",
    }
