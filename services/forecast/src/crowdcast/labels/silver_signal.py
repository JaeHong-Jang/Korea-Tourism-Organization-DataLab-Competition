"""연도별 후보 대비 유의 신호 비율을 검증하고 직전 실행 대비 유지 여부를 계산한다."""

from typing import Any

from crowdcast.labels.schema import DECIMALS


# bool·음수·소수 건수가 비교 분모로 들어오지 않게 한다.
def count_value(value: Any) -> int:
    if type(value) is not int or value < 0:
        raise ValueError("직전 labels_g0.json의 건수 타입·범위 오류")
    return value


# 표시용 비율만 반올림하고 판정은 정수 교차곱으로 한다.
def ratio_check(numerator: int, denominator: int, passed: bool) -> dict[str, Any]:
    return {
        "numerator": numerator,
        "denominator": denominator,
        "ratio": round(numerator / denominator, DECIMALS) if denominator else None,
        "status": "pass" if passed else "fail",
    }


# 연도 중복·잘못된 분자와 분모를 거부하며 없는 연도는 임의로 채우지 않는다.
def validate_years(rows: Any) -> list[dict[str, int]]:
    if not isinstance(rows, list):
        raise ValueError("직전 labels_g0.json의 signal_by_year 목록 오류")
    years = set()
    for row in rows:
        if not isinstance(row, dict) or set(row) != {"year", "candidate_count", "significant_count"}:
            raise ValueError("직전 labels_g0.json의 연도별 필드 오류")
        year = count_value(row["year"])
        candidates = count_value(row["candidate_count"])
        significant = count_value(row["significant_count"])
        if not 1900 <= year <= 2200 or year in years or candidates == 0 or significant > candidates:
            raise ValueError("직전 labels_g0.json의 연도·분자·분모 오류")
        years.add(year)
    return sorted(rows, key=lambda row: row["year"])


# 총수와 연도별 수가 다른 저장 파일은 비교 기준으로 쓰지 않는다.
def validate_population(silver: dict[str, Any]) -> list[dict[str, int]]:
    rows = validate_years(silver["signal_by_year"])
    for key in ("candidate_count", "significant_count"):
        if count_value(silver[key]) != sum(row[key] for row in rows):
            raise ValueError(f"직전 labels_g0.json의 {key} 연도별 합계 불일치")
    return rows


# 첫 실행은 최소 30건, 이후에는 같은 연도의 비율을 개별 비교해 구성 변화에 가리지 않는다.
def retention_check(current: list[dict[str, int]], baseline: list[dict[str, int]] | None) -> dict[str, Any]:
    current_index = {row["year"]: row for row in current}
    prior_index = {row["year"]: row for row in baseline or []}
    comparable = set(current_index) & set(prior_index)
    first = (
        ratio_check(
            sum(row["significant_count"] for row in current),
            30,
            sum(row["significant_count"] for row in current) >= 30,
        )
        if not comparable
        else None
    )
    checks = []
    for year in sorted(set(current_index) | set(prior_index)):
        row = current_index.get(year, {"significant_count": 0, "candidate_count": 0})
        prior = prior_index.get(year)
        numerator, denominator = row["significant_count"], row["candidate_count"]
        passed = prior is None or (
            denominator > 0
            and numerator * prior["candidate_count"] * 5 >= prior["significant_count"] * denominator * 4
        )
        check = {"year": year, **ratio_check(numerator, denominator, passed)}
        check.update(
            previous_numerator=prior["significant_count"] if prior else None,
            previous_denominator=prior["candidate_count"] if prior else None,
            previous_ratio=(
                round(prior["significant_count"] / prior["candidate_count"], DECIMALS) if prior else None
            ),
            retention_ratio=(
                round(
                    numerator * prior["candidate_count"] / (denominator * prior["significant_count"]),
                    DECIMALS,
                )
                if prior and prior["significant_count"] and denominator
                else None
            ),
        )
        if prior is None:
            check["status"] = "no_previous_year"
        checks.append(check)
    return {
        "baseline_by_year": baseline,
        "first_run_minimum": first,
        "by_year": checks,
        "status": "fail"
        if (first and first["status"] == "fail") or any(row["status"] == "fail" for row in checks)
        else "pass",
        "note": (
            "첫 실행 — 비교 없음; 유의 신호 ≥ 30건"
            if baseline is None
            else "직전 실행의 같은 연도별 유의 신호 비율 ≥ 80%; 신규 연도는 비교 없음"
        ),
    }


# 저장된 판정은 타입만 확인하고 숫자 근거는 재계산 결과와 대조한다.
def validate_retention(saved: Any, expected: Any, key: str = "signal_retention") -> None:
    if isinstance(expected, dict):
        if not isinstance(saved, dict) or set(saved) != set(expected):
            raise ValueError(f"직전 labels_g0.json의 {key} 필드 오류")
        for field in expected:
            validate_retention(saved[field], expected[field], field)
    elif isinstance(expected, list):
        if not isinstance(saved, list) or len(saved) != len(expected):
            raise ValueError(f"직전 labels_g0.json의 {key} 목록 오류")
        for actual, wanted in zip(saved, expected, strict=True):
            validate_retention(actual, wanted, key)
    elif key == "status":
        if not isinstance(saved, str) or saved not in {"pass", "fail", "no_previous_year"}:
            raise ValueError("직전 labels_g0.json의 status 오류")
    elif key == "note":
        if not isinstance(saved, str):
            raise ValueError("직전 labels_g0.json의 note 타입 오류")
    elif type(saved) is not type(expected) or saved != expected:
        raise ValueError(f"직전 labels_g0.json의 {key} 타입·분자·분모·비율 불일치")


# 동일 스냅샷도 검증한 기준값만 재사용하고 현재 분자·분모로 판정을 다시 계산한다.
def signal_retention(
    current: dict[str, Any], previous: dict[str, Any] | None, snapshot: str
) -> dict[str, Any]:
    rows = validate_population(current)
    if previous is None:
        return retention_check(rows, None)
    prior = previous["silver"]
    prior_rows = validate_population(prior)
    baseline = prior_rows
    if previous["schema_version"] == 2:
        saved = prior["signal_retention"]
        saved_baseline = saved["baseline_by_year"]
        if saved_baseline is not None:
            saved_baseline = validate_years(saved_baseline)
        validate_retention(saved, retention_check(prior_rows, saved_baseline))
        if previous["snapshot_sha256"] == snapshot:
            if rows != prior_rows:
                raise ValueError("동일 스냅샷의 연도별 모집단 불일치")
            baseline = saved_baseline
    return retention_check(rows, baseline)
