"""학습·명절 제외 전 실버 순증으로 부호·신호 유지 게이트와 사례별 QC를 만든다."""

import math
from collections import defaultdict
from typing import Any

import polars as pl
from crowdcast.labels.schema import DECIMALS
from crowdcast.labels.silver_signal import ratio_check


# 반올림 전 부호와 엄격한 |SNR| > 3을 기준으로 모든 계산 가능 후보를 집계한다.
def silver_metrics(candidates: list[dict[str, Any]], labels: pl.DataFrame) -> dict[str, Any]:
    significant = [
        row
        for row in candidates
        if row["sigma"] > 0 and row["snr"] is not None and math.isfinite(row["snr"]) and abs(row["snr"]) > 3
    ]
    negative = [row for row in candidates if row["daily_mean"] < 0]
    significant_negative = [row for row in significant if row["daily_mean"] < 0]
    cases = [
        {key: round(value, DECIMALS) if isinstance(value, float) else value for key, value in row.items()}
        for row in sorted(significant_negative, key=lambda row: row["event_id"])
    ]
    return {
        "candidate_count": len(candidates),
        "significant_count": len(significant),
        "significant_negative": ratio_check(
            len(significant_negative),
            len(significant),
            bool(significant) and len(significant_negative) * 20 < len(significant),
        ),
        "all_negative": {
            **ratio_check(len(negative), len(candidates), True),
            "status": "warn" if len(negative) * 2 > len(candidates) else "pass",
        },
        "zero_sigma_count": sum(row["sigma"] == 0 for row in candidates),
        "missing_snr_count": sum(row["snr"] is None for row in candidates),
        "unexpected_missing_snr_count": sum(row["sigma"] != 0 and row["snr"] is None for row in candidates),
        "invalid_snr_count": sum(
            not math.isfinite(row["sigma"])
            or row["sigma"] < 0
            or (row["snr"] is not None and (not math.isfinite(row["snr"]) or row["sigma"] == 0))
            for row in candidates
        ),
        "zero_significant_count": int(not significant),
        "signal_by_year": [
            {
                "year": year,
                "candidate_count": sum(row["year"] == year for row in candidates),
                "significant_count": sum(row["year"] == year for row in significant),
            }
            for year in sorted({row["year"] for row in candidates})
        ],
        "significant_negative_cases": cases,
        "increment_by_year_sido": increment_distribution(candidates),
        "holiday_by_year_type": holiday_counts(candidates, labels),
    }


# 연도·시도 층별 순증의 부호와 꼬리를 함께 공개한다.
def increment_distribution(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups = defaultdict(list)
    for row in candidates:
        groups[(row["year"], row["sido"])].append(row["daily_mean"])
    result = []
    for (year, sido), values in sorted(groups.items()):
        series = pl.Series(values, dtype=pl.Float64)
        result.append(
            {
                "year": year,
                "sido": sido,
                "candidate_count": len(values),
                "negative_count": sum(value < 0 for value in values),
                **{
                    key: round(value, DECIMALS)
                    for key, value in {
                        "min": series.min(),
                        "p25": series.quantile(0.25, interpolation="linear"),
                        "median": series.median(),
                        "mean": series.mean(),
                        "p75": series.quantile(0.75, interpolation="linear"),
                        "max": series.max(),
                    }.items()
                },
            }
        )
    return result


# 명절 제외는 부호와 무관하며 남은 후보와 실제 학습 가능 표본을 별도로 센다.
def holiday_counts(candidates: list[dict[str, Any]], labels: pl.DataFrame) -> list[dict[str, Any]]:
    usable = set(
        labels.filter(
            (pl.col("label_tier") == "silver") & pl.col("is_primary") & pl.col("usable_for_training")
        )["event_id"].to_list()
    )
    groups = defaultdict(list)
    for row in candidates:
        groups[(row["year"], row["type"])].append(row)
    return [
        {
            "year": year,
            "type": event_type,
            "candidate_count": len(rows),
            "holiday_overlap_count": sum(bool(row["holiday_dates"]) for row in rows),
            "remaining_count": sum(not row["holiday_dates"] for row in rows),
            "usable_remaining_count": sum(row["event_id"] in usable for row in rows),
        }
        for (year, event_type), rows in sorted(groups.items())
    ]


# 실패 시 표를 오류 출력에 포함하고 파일 기록은 호출부에서 시작하지 못하게 한다.
def enforce_silver_gate(silver: dict[str, Any]) -> None:
    failed = [key for key in ("significant_negative", "signal_retention") if silver[key]["status"] == "fail"]
    failed += [
        key
        for key in ("unexpected_missing_snr_count", "invalid_snr_count", "zero_significant_count")
        if silver[key]
    ]
    if failed:
        raise ValueError("실버 부호 검사 실패: " + ", ".join(failed) + "\n" + "\n".join(silver_lines(silver)))


# 각 검사의 분자·분모·판정과 반올림 전 수치를 사용했다는 근거를 표로 적는다.
def silver_lines(silver: dict[str, Any]) -> list[str]:
    lines = [
        "",
        "## 실버 부호 검사",
        "",
        "학습·명절·골든 제외 전 계산 가능 후보의 부호 있는 원래 순증과 SNR로 판정한다. "
        "표시 수치만 반올림하며 |SNR| > 3에 σ=0·SNR 결측을 포함하지 않는다.",
        "| 검사 | numerator | denominator | ratio | 기준 | status |",
        "|---|---:|---:|---:|---|---|",
    ]
    for key, threshold in (
        ("significant_negative", "① 중단: ≥ 5%"),
        ("all_negative", "② 경고: > 50% (임시 운영 기준 — 검증 전)"),
    ):
        check = silver[key]
        ratio = f"{check['ratio']:.2%}" if check["ratio"] is not None else "산정 불가"
        lines.append(
            f"| {key} | {check['numerator']} | {check['denominator']} | "
            f"{ratio} | {threshold} | {check['status']} |"
        )
    retention = silver["signal_retention"]
    lines += ["", "③ 신호 유지: " + retention["note"] + f"; status={retention['status']}"]
    if first := retention["first_run_minimum"]:
        lines.append(
            f"첫 실행 최소 유의 신호: {first['numerator']}/{first['denominator']}건; status={first['status']}"
        )
    lines += [
        "동일 snapshot_sha256도 이전 필드·타입·분자·분모를 검증하고 판정을 다시 계산한다. "
        "비교 기준값만 유지해 반복 실행의 바이트를 보존한다. "
        "새 스냅샷은 직전 성공 실행의 같은 연도별 비율과 비교하며 한 연도라도 80% 미만이면 중단한다.",
        "",
        "| year | numerator | denominator | ratio | previous_numerator | previous_denominator | "
        "previous_ratio | retention_ratio | status |",
        "|---:|---:|---:|---:|---:|---:|---:|---:|---|",
    ]
    columns = (
        "year",
        "numerator",
        "denominator",
        "ratio",
        "previous_numerator",
        "previous_denominator",
        "previous_ratio",
        "retention_ratio",
        "status",
    )
    lines += ["| " + " | ".join(str(row[key]) for key in columns) + " |" for row in retention["by_year"]]
    lines += [
        "",
        "④ σ·SNR 진단 (오류·유의 신호 0건은 중단)",
        f"σ=0: {silver['zero_sigma_count']}/{silver['candidate_count']}건; "
        f"SNR 결측: {silver['missing_snr_count']}/{silver['candidate_count']}건; "
        f"σ≠0인데 SNR 결측: {silver['unexpected_missing_snr_count']}/{silver['candidate_count']}건; "
        f"σ·SNR 계산 오류: {silver['invalid_snr_count']}/{silver['candidate_count']}건; "
        f"유의 신호: {silver['significant_count']}/{silver['candidate_count']}건; "
        f"유의 신호 0건 검사: {silver['zero_significant_count']}/1.",
        "σ=0은 snr=null·zero_sigma로 기록하고 후보 분모에는 넣되 유의 판정·학습에서 제외한다. "
        "유의 신호 0건·후보 0건은 음수 비율 판정 불가로 실패하며 산출물을 쓰지 않는다.",
        "",
        "### 유의 음수 사례",
        "",
        "| event_id | 행사명 | year | sido | start | end | daily_mean | baseline_mean | sigma | snr | "
        "baseline_sample_count | holiday_dates |",
        "|---|---|---:|---|---|---|---:|---:|---:|---:|---:|---|",
    ]
    for row in silver["significant_negative_cases"]:
        lines.append(
            "| "
            + " | ".join(
                str(row[key])
                for key in (
                    "event_id",
                    "festival_name",
                    "year",
                    "sido",
                    "start",
                    "end",
                    "daily_mean",
                    "baseline_mean",
                    "sigma",
                    "snr",
                    "baseline_sample_count",
                    "holiday_dates",
                )
            )
            + " |"
        )
    lines += [
        "",
        "### ⑤ 연도·시도별 순증 분포",
        "",
        "| year | sido | candidate_count | negative_count | min | p25 | median | mean | p75 | max |",
        "|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    lines += [
        "| " + " | ".join(str(value) for value in row.values()) + " |"
        for row in silver["increment_by_year_sido"]
    ]
    lines += [
        "",
        "### 명절 겹침 제외와 남은 표본",
        "",
        "holidays KR 한국어 이름에 설날·추석이 포함된 날짜(전날·다음날·해당 대체공휴일)에만 "
        "고정한다. 인접 주말·임시공휴일로 범위를 넓히지 않는다. 하루라도 겹치면 부호와 무관하게 "
        "holiday_overlap·학습 제외하며 실버 백테스트에서도 제외해야 한다.",
        "usable_remaining_count는 is_primary & usable_for_training 기준이다.",
        "| year | type | candidate_count | holiday_overlap_count | remaining_count | "
        "usable_remaining_count |",
        "|---:|---|---:|---:|---:|---:|",
    ]
    lines += [
        "| " + " | ".join(str(value) for value in row.values()) + " |"
        for row in silver["holiday_by_year_type"]
    ]
    lines += [
        "가설: 작은 행사는 시군구 잡음에 묻히고 유의 음수에 연휴·계절 효과가 섞일 수 있다. "
        "명절 제외로 벚꽃 등 계절 교란이 해결되지는 않는다. 명절은 골드가 있을 때만 평가하고 "
        "없으면 채점 불가로 공개하며 비명절 성적을 일반화하지 않는다."
    ]
    return lines
