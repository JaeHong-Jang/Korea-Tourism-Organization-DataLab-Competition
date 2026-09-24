"""수집 격자·신선도·공유 장부와 저장된 라벨·후속 단계 결과를 판정한다."""

import csv
import json
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import polars as pl
from crowdcast import paths
from crowdcast.api.contract import validate
from crowdcast.data.call_ledger import DAILY_LIMIT
from crowdcast.data.visitors import TOU_DIV
from crowdcast.pipeline.run_record import sha256


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


# 실제 관측일과 수집 완료일의 격자로 누락 지역·구분·전체 날짜를 함께 센다.
def fetch_gate(today: date) -> dict[str, Any]:
    output = paths.PROCESSED / "region_daily.parquet"
    frame = pl.read_parquet(output)
    if frame.is_empty():
        return {"passed": False, "message": "region_daily가 비어 있습니다"}
    if frame.select(pl.any_horizontal(pl.col("date", "sigungu_code", "tou_div").is_null()).any()).item():
        return {"passed": False, "message": "region_daily 격자 키 결측"}
    days = set(frame["date"].to_list())
    checkpoint = output.with_suffix(".progress.json")
    if checkpoint.exists():
        progress = json.loads(checkpoint.read_bytes())
        if progress["parquet_sha256"] != sha256(output):
            return {"passed": False, "message": "region_daily 체크포인트 해시 불일치"}
        days.update(date.fromisoformat(day) for day in progress["completed_dates"])

    # 결측률 = (시군구 수 × 확보·완료 날짜 수 − 완전한 칸 수) / 전체 칸 수.
    # 미수집 연도·구간은 분모에 넣지 않으며, 한 칸은 현지인·외지인·외국인 모두 유효해야 한다.
    expected = frame["sigungu_code"].n_unique() * len(days)
    valid = (
        frame.group_by("sigungu_code", "date")
        .agg(
            (pl.col("visitors").is_not_null() & pl.col("visitors").is_finite() & (pl.col("visitors") >= 0))
            .all()
            .alias("valid"),
            pl.col("tou_div").n_unique().alias("divisions"),
            pl.col("tou_div").is_in(list(TOU_DIV.values())).all().alias("known"),
            pl.len().alias("rows"),
        )
        .filter(pl.col("valid") & pl.col("known") & (pl.col("divisions") == 3) & (pl.col("rows") == 3))
        .height
    )
    missing = expected - valid
    latest, cutoff = frame["date"].max(), today - timedelta(days=40)
    calls = ledger_calls(today)
    passed = missing * 50 < expected and cutoff <= latest <= today and calls <= DAILY_LIMIT
    return {
        "passed": passed,
        "message": (
            f"시군구×확보·완료일 격자 결측 {missing}/{expected}={missing / expected:.6%} (<2%); "
            f"최신 관측일 {latest} (기준 {cutoff} 이상, 미래 제외); 공유 장부 {calls}/{DAILY_LIMIT}건"
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


# 기존 결과를 실행 전에 읽어 백테스트·일괄 예보의 비교 기준을 보존한다.
def previous_result(stage: str) -> Any:
    if stage == "backtest":
        files = list((paths.REPORTS / "backtest").glob("*/backtest.json"))
        if files:
            return json.loads(max(files, key=lambda path: path.stat().st_mtime_ns).read_bytes())
    if stage == "batch" and (paths.PROCESSED / "upcoming.parquet").exists():
        return pl.scan_parquet(paths.PROCESSED / "upcoming.parquet").select(pl.len()).collect().item()
    return None


# 후속 모듈의 검증 종료 코드 외에 저장 산출물과 단계 간 비교 게이트를 확인한다.
def optional_gate(stage: str, files: list[Path], previous: Any) -> dict[str, Any]:
    if stage == "features":
        return {"passed": True, "message": "피처 모듈 종료 코드 0; available_at 검사는 모듈에서 수행"}
    if not files:
        return {"passed": False, "message": f"{stage} 산출물 없음"}
    if stage == "train":
        card = json.loads((paths.MODELS / "model_card.json").read_bytes())
        validate("model-card", card)
        saved = any(path.parent != paths.MODELS for path in files)
        return {"passed": saved, "message": f"학습 모듈 종료 코드 0; 모델 카드 계약 통과; 모델 파일={saved}"}
    if stage == "batch":
        count = pl.scan_parquet(paths.PROCESSED / "upcoming.parquet").select(pl.len()).collect().item()
        warning = previous is not None and count * 10 < previous * 9
        return {
            "passed": True,
            "message": f"예보 수={count}, 직전={previous}; "
            + ("경고: 직전 90% 미만 (중단하지 않음)" if warning else "예보 수 게이트 통과"),
        }

    # 백테스트 표시 지표는 백분율(예: 포함률 80)이므로 %p를 그대로 더하고 뺀다.
    current = json.loads(
        max(
            (p for p in files if p.name == "backtest.json"), key=lambda path: path.stat().st_mtime_ns
        ).read_bytes()
    )
    validate("backtest-summary", current)
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
    passed = new["mdape"] <= old["mdape"] + 3 and new["coverage80"] >= old["coverage80"] - 5
    return {
        "passed": passed and golden,
        "message": f"MdAPE={new['mdape']}% (직전 {old['mdape']}% +3%p); "
        f"포함률={new['coverage80']}% (직전 {old['coverage80']}% -5%p); 골든 재현={golden}",
    }
