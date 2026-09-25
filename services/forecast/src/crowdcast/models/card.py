"""같은 백테스트 결과로 모델 카드·계약 검증·상세 성적표를 만든다."""

import json
import runpy
from collections import Counter
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from crowdcast.models.backtest import disclosure
from crowdcast.models.baselines import size_band
from crowdcast.models.report_tables import (
    announcement_table,
    baseline_table,
    feature_comparison,
    metric_table,
    sensitivity_table,
)
from crowdcast.paths import REPO_ROOT
from jsonschema import Draft202012Validator

# 서식4·S6와 같은 의미로 인용하도록 조건부 성능의 정의를 고정한다.
CONDITIONAL_DEFINITION = (
    "행사 속성이 주어졌을 때의 예보 성능 — 당시 공개 여부를 입증하지 않은 행사 속성을 쓴다"
)


# 정본 검사기의 레지스트리를 사용하고 형식 검사까지 직접 실행한다.
def validate_contract(name: str, value: dict[str, Any]) -> None:
    path = REPO_ROOT / "packages/contracts/check/python_check.py"
    registry, schemas = runpy.run_path(str(path))["build_registry"]()
    Draft202012Validator(
        schemas[name], registry=registry, format_checker=Draft202012Validator.FORMAT_CHECKER
    ).validate(value)


# 표본·누수·환산 한계를 서식4에서 그대로 인용할 수 있도록 카드에 명시한다.
def model_card(
    result: dict[str, Any],
    version: str,
    run_id: str,
    names: list[str],
    config: dict[str, Any],
    labels_sha256: str,
    missing: dict[str, int],
) -> dict[str, Any]:
    g0 = result["g0"]
    shown = disclosure(result)
    skipped = ", ".join(f"{row['year']}({row['reason']})" for row in shown["skippedYears"]) or "없음"
    pairs = shown["baselinePairs"]
    counts = (
        f"공개 분모(주 모델): 평가 {shown['evaluated']}건(골드 {shown['byTier']['gold']}·실버 "
        f"{shown['byTier']['silver']}), 80% 구간 포함 {shown['covered']}/{shown['evaluated']}, "
        f"비교 쌍 B0 {pairs['b0']}·B1 {pairs['b1']}(전회차 골드 실측)·B2 {pairs['b2']}, "
        f"건너뛴 연도 {skipped}, "
        f"명절 실버 채점 불가 {shown['unscorable']}건, 실측 대상 미만 {shown['belowThresholdActual']}건. "
    )
    notes = (
        counts + f"labels SHA-256={labels_sha256}; 실버 가중치={config['silver_weight']}·"
        f"골드 가중치={config['gold_weight']}(단순 모델 계층 중앙값·잔차 분위수와 LightGBM 모두 적용, "
        f"B0 기준선만 무가중 유형 중앙값); 코로나(2020·2021) 제외={config['exclude_covid']}; "
        f"G0={g0['branch']}, 주 모델={g0['primary_model']}, judgment.basis={g0['basis']}; "
        f"정의 일치 골드 고유 행사={g0['gold_summary']['gold_event_count']}; 목표 포함률 80%(보장 아님). "
        "표본 한계로 구간 기준 표시 시에도 등급·적용 규칙은 같은 표본의 확률 판정으로 정한다. "
        "순간 최대 및 실측 환산 판정은 추정 산식 기반이며 실제 순간 인원 정답이 아니다. "
        "실버 holiday_overlap·명절 행사는 학습·채점 제외, 채점 불가 건수를 별도 공개한다. "
        "실버는 시군구 순증 보조 정답으로 골드 행사장 방문자와 정의가 다르며 계절 교란이 남는다. "
        f"기본 = 조건부 백테스트: {CONDITIONAL_DEFINITION}. "
        "참고 = 파일명 날짜 기준 민감도는 별도 표이며 공개일 미입증(엄격한 D-14 입증이 아님). "
        "행사 속성까지 D-14 공개가 입증된 백테스트는 공식 공개 기록이 없어 지금은 만들 수 없다. "
        "임시공휴일은 지정 시각을 복원할 수 없어 두 백테스트의 달력 피처에서 제외했다. "
        "공개 시점 규칙은 지역 관측·전회차 라벨에만 적용한다. 입력 행사 일정·장소는 예보 대상 정의이고 "
        "환산은 같은 행사 정의에 적용한다. "
        "전년 방문객수 visitors_announced와 log1p는 라벨이 아닌 행사 입력이다. "
        "단순 모델의 규모 계층은 전회차 골드, 학습 구간에서 보정한 발표치, 유형 중앙값 순으로 고른다. "
        "발표치/입력 기간을 일평균 규모 대용치로 쓰며 대용치/학습 라벨의 가중 중앙 비율로 보정한다. "
        "이는 전년 발표와 올해 라벨의 예측 관계이며 동일 회차 발표 과장률이나 실측 일평균이 아니다. "
        "실버 쌍은 시군구 순증과의 보조 보정이며 행사장 실측과 같은 정의로 해석하지 않는다. "
        "발표치 0은 입력으로 보존하되 보정비율 적합에서 제외한다. "
        "결측·기간 미상·보정 쌍 부재는 유형으로 대체한다. "
        "해당 규모 계층이 비어 있으면 유형 중앙값을 유지하므로 작은 행사 규모 편향이 남을 수 있다. "
        "골드B는 행사장 일치가 확인된 라벨만 학습·전회차에 쓰고 지정영역은 참고로 보존한다. "
        "최종 모델은 마지막 성공 롤링 분할 그대로이며 평가 자료를 재학습하지 않았다. "
        "MdAPE는 %, coverage80·재현율·정밀도는 비율, coverageN은 평가 분모; "
        "계약 baselineDeltaPp·comparablePairs는 B2 단위 일치 쌍 기준이다. "
        "SHAP은 LightGBM 중앙값 로그 예측 설명이며 단순 주 모델의 설명으로 사용하지 않는다. "
        "판정 재현율·정밀도는 등급이 수립 대상 이상인 이진 분류 기준이다. "
        "대상 미만 표본이 없는 평가에서는 판정 경계의 구분 성능을 주장할 수 없다. "
        f"피처별 결측 수={json.dumps(missing, ensure_ascii=False, sort_keys=True)}. 참고용 — 담당자 검토 필수"
    )
    return {
        "id": f"mr-{version}",
        "modelVersion": version,
        "target": "일평균 방문객",
        "trainRange": result["last_train_range"],
        "features": names,
        "evalYears": [fold["year"] for fold in result["folds"] if fold["skipped"] is None],
        "backtestRunId": run_id,
        "createdAt": datetime.now(ZoneInfo("Asia/Seoul")).isoformat(),
        "notes": notes,
    }


# 기계용 수치와 함께 건너뛴 연도·제외 사유·등급·규모·단위 한계를 기록한다.
def backtest_markdown(
    result: dict[str, Any],
    card: dict[str, Any],
    excluded: list[dict[str, Any]],
    input_hashes: dict[str, str],
    comparison: tuple[str, list[dict[str, Any]]] | None = None,
) -> str:
    points = [{**p, "size": size_band(p["actual"])} for p in result["points"]]
    lines = [
        f"# 백테스트 {card['backtestRunId']}",
        "",
        card["notes"],
        "",
        "## 입력 SHA-256",
        "",
        *[f"- {name}: `{digest}`" for name, digest in input_hashes.items()],
        "",
        "## 분할",
        "",
        "| 평가 연도 | 학습 N | 보정 N | 평가 후보 N | 공개 지연 제외(학습/보정) | 결과 |",
        "|---:|---:|---:|---:|---:|---|",
    ]
    lines.extend(
        f"| {f['year']} | {f['train_n']} | {f['calibration_n']} | {f['evaluation_n']} | "
        f"{f['late_train_n']}/{f['late_calibration_n']} | "
        f"{f['skipped'] or '실행'} |"
        for f in result["folds"]
    )
    lines += [
        "",
        "학습 ≤ Y−2·보정 Y−1, 학습·보정 라벨 공개일 ≤ 첫 평가 행사 D-14. "
        "단순 모델은 학습 잔차 구간, LightGBM은 MAPIE CQR 보정. 두 모델의 평가 행사는 동일하다.",
    ]
    for heading, grouping in (
        ("전체", None),
        ("연도별", "year"),
        ("라벨 등급별", "tier"),
        ("규모대별", "size"),
    ):
        lines += ["", f"## {heading}", "", *metric_table(points, grouping)]
    if "sensitivity" in result:
        lines += sensitivity_table(result["sensitivity"]["points"])
    if "announcement_calibration" in result:
        lines += announcement_table(result["announcement_calibration"])
    lines += [
        "",
        "## 기준선",
        "",
        *baseline_table(points),
        "",
        "## 학습·채점 제외",
        "",
        "사유는 중복 집계한다. 명절 실버는 신호 크기·부호와 무관하게 채점 불가이며 골드는 별도 평가한다.",
        "",
        "| 연도 | 유형 | 사유 | N |",
        "|---:|---|---|---:|",
    ]
    totals = Counter(reason for row in excluded for reason in row["reasons"])
    lines.insert(
        -3, f"코로나 제외 {totals['코로나']}건; 명절 실버 채점 불가 {totals['명절 실버 채점 불가']}건."
    )
    counts = Counter(
        (row["year"], row["type"] or "미상", reason) for row in excluded for reason in row["reasons"]
    )
    lines += [
        f"| {year} | {kind} | {reason} | {count} |" for (year, kind, reason), count in sorted(counts.items())
    ]
    lines += ["", "## 제외 후 남은 표본", "", "| 연도 | 유형 | N |", "|---:|---|---:|"]
    lines += [f"| {row['year']} | {row['type']} | {row['n']} |" for row in result.get("selected_counts", [])]
    lines += [
        "",
        "## 환산 판정 표본",
        "",
        "| 연도 | 모델 | 실제 대상 이상 | 실제 대상 미만 | 예측 대상 이상 |",
        "|---:|---|---:|---:|---:|",
    ]
    for year in sorted({p["year"] for p in points}):
        for model in ("simple", "lightgbm"):
            rows = [p for p in points if p["year"] == year and p["model"] == model]
            positive = sum(p["actual_level"] >= 3 for p in rows)
            predicted = sum(p["level"] >= 3 for p in rows)
            lines.append(f"| {year} | {model} | {positive} | {len(rows) - positive} | {predicted} |")
    lines += ["", "## 골든", "", f"재현 {len(result['golden'])}건."]
    if not result["golden"]:
        lines.append("평가 가능한 골든 라벨·당시 학습 모델의 쌍이 없어 golden=[]로 남긴다.")
    lines += [
        *result["golden_skipped"],
        "",
        "## 사전 G0",
        "",
        "```json",
        json.dumps(result["g0"], ensure_ascii=False, sort_keys=True, indent=2),
        "```",
        "",
    ]
    if comparison is not None:
        before_id, before_points = comparison
        lines += feature_comparison(before_id, before_points, points)
    return "\n".join(lines)


# 사용 모델 카드는 그대로 두고 도전 모델 카드에만 비교 결과 한 줄을 기록한다.
def challenger_card(base: dict[str, Any], comparison: dict[str, Any]) -> dict[str, Any]:
    score = next(row for row in comparison["metrics"] if row["model"] == "pymc" and row["year"] is None)
    version = comparison["modelVersion"]
    return {
        **base, "id": f"mr-{version}", "modelVersion": version, "backtestRunId": None,
        "features": ["type (부분 풀링)", "sido (부분 풀링)", *comparison["features"]],
        "notes": (
            f"도전 모델 비교: {comparison['baseRunId']}/challenger/comparison.md; "
            f"PyMC {comparison['config']['method']}·log 일평균 Student-t; "
            f"MdAPE {score['mdape']:.6f}%, 80% 포함 {score['covered']}/{score['coverageN']}. "
            "같은 롤링 폴드·라벨, 마지막 성공 학습 분할만 저장. "
            "가중 우도·평균장 ADVI 또는 짧은 NUTS 사후분포는 수렴 미확인. "
            f"{CONDITIONAL_DEFINITION}. 외부 관측은 D-14 공개일 검사, 유형·시도는 행사 입력이다. "
            "실버는 시군구 순증 보조 정답이며 환산 판정은 추정 산식 기반이다. "
            "도전 모델은 승격 대상 아님·기본 예보 미연결·합의 근거 기본 끔. 참고용 — 담당자 검토 필수"
        ),
    }
