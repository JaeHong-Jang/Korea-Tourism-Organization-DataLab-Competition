"""백테스트 지표와 기준선·민감도·수정 전후 비교표를 같은 계산식으로 만든다."""

from typing import Any

import numpy as np
from crowdcast.models.backtest import metrics


# 보정 쌍 부재를 1배로 바꾸지 않고 실제 학습 계수와 골드·실버 쌍 수를 보인다.
def announcement_table(calibrations: list[dict[str, Any]]) -> list[str]:
    return [
        "",
        "## 전년 발표치 규모 보정",
        "",
        "비율 = (전년 누적 발표치 / 입력 행사 기간) / 학습 일평균 라벨의 가중 중앙값. "
        "학습 ≤ Y−2만 사용하며 보정·평가 연도 정답은 사용하지 않는다. "
        "전년과 올해의 예측 관계로, 동일 회차 발표 과장률을 뜻하지 않는다. "
        "실버는 시군구 순증과의 보조 관계이며 행사장 실측 비율이 아니다. "
        "비율·기간·발표치가 없으면 유형 중앙값으로 규모대를 고른다.",
        "",
        "| 정의 | 평가 연도 | 보정비율 | 골드A 쌍 | 골드B 쌍 | 실버 쌍 |",
        "|---|---:|---:|---:|---:|---:|",
        *[
            f"| {row['definition']} | {row['year']} | {number(row['ratio'])} | "
            f"{row['pairs'].get('goldA', 0)} | {row['pairs'].get('goldB', 0)} | "
            f"{row['pairs'].get('silver', 0)} |"
            for row in calibrations
        ],
    ]


# 미정의 지표는 영으로 바꾸지 않고 분모 부재를 표시한다.
def number(value: float | None, *, percent: bool = False) -> str:
    return "—" if value is None else f"{value * (100 if percent else 1):.6f}"


# 모든 표를 같은 지표 함수로 만들어 비교군마다 채점식이 달라지는 것을 막는다.
def metric_table(points: list[dict[str, Any]], grouping: str | None = None) -> list[str]:
    lines = [
        "| 구분 | 모델 | N | MdAPE(%) | 포함률(%) | 포함/N | 폭 중앙값 | 재현율(%) | 정밀도(%) |",
        "|---|---|---:|---:|---:|---:|---:|---:|---:|",
    ]
    groups = sorted({str(p[grouping]) for p in points}) if grouping else ["전체"]
    if grouping == "size":
        groups = ["<1000", "1000~5000", ">5000"]
    elif grouping == "tier":
        groups = ["goldA", "goldB", "silver"]
    for group in groups:
        for model in ("simple", "lightgbm"):
            rows = [
                p for p in points if p["model"] == model and (grouping is None or str(p[grouping]) == group)
            ]
            if not rows:
                lines.append(f"| {group} | {model} | 0 | — | — | 0/0 | — | — | — |")
                continue
            m = metrics(rows)
            hits = sum(p["p10"] <= p["actual"] <= p["p90"] for p in rows)
            width = float(np.median([p["p90"] - p["p10"] for p in rows]))
            lines.append(
                f"| {group} | {model} | {len(rows)} | {number(m['mdape'])} | "
                f"{number(m['coverage80'], percent=True)} | {hits}/{len(rows)} | {number(width)} | "
                f"{number(m['judgmentRecall'], percent=True)} | "
                f"{number(m['judgmentPrecision'], percent=True)} |"
            )
    return lines


# B0·B1·B2는 각각 동일 쌍의 MdAPE 차이를 보고하며 양수는 모델의 오차 감소다.
def baseline_table(points: list[dict[str, Any]]) -> list[str]:
    lines = [
        "| 연도 | 모델 | 기준선 | 비교 쌍 | 기준선 MdAPE(%) | 같은 쌍 모델 MdAPE(%) | 개선(%p) |",
        "|---|---|---|---:|---:|---:|---:|",
    ]
    for year in sorted({p["year"] for p in points}):
        for model in ("simple", "lightgbm"):
            rows = [p for p in points if p["year"] == year and p["model"] == model]
            for baseline in ("b0", "b1", "b2"):
                pairs = [p for p in rows if p[baseline] is not None]
                base = (
                    float(np.median([abs(p[baseline] - p["actual"]) / p["actual"] * 100 for p in pairs]))
                    if pairs
                    else None
                )
                m = metrics(pairs, baseline) if pairs else {"mdape": None, "baselineDeltaPp": None}
                lines.append(
                    f"| {year} | {model} | {baseline.upper()} | {len(pairs)} | {number(base)} | "
                    f"{number(m['mdape'])} | {number(m['baselineDeltaPp'])} |"
                )
    return lines


# 명세 수정 전후의 고정 실행을 같은 지표로 나란히 기록하며 모델 선택에는 쓰지 않는다.
def feature_comparison(
    before_id: str, before: list[dict[str, Any]], after: list[dict[str, Any]]
) -> list[str]:
    points = [
        {**point, "revision": f"{point['year']} · {label}"}
        for label, rows in (("수정 전", before), ("수정 후", after))
        for point in rows
    ]
    return [
        "## 모델·피처 수정 전후",
        "",
        f"수정 전 실행: `{before_id}`. 두 실행 모두 고정 설정이며 평가 후 튜닝하지 않았다.",
        "각 실행의 전체 평가 표본을 나란히 표시하며 기준선 개선은 같은 쌍에서 계산한다.",
        "",
        *metric_table(points, "revision"),
        "",
        "수정 전 기준선",
        "",
        *baseline_table(before),
        "",
        "수정 후 기준선",
        "",
        *baseline_table(after),
        "",
    ]


# 민감도 성적은 주 지표와 분리하고 속성 결측 처리 수도 평가 행사 기준으로 공개한다.
def sensitivity_table(points: list[dict[str, Any]]) -> list[str]:
    lines = [
        "",
        "## 참고: 파일명 날짜 기준 민감도",
        "",
        "공개일 미입증 — 파일명 날짜가 실제 공개일·그날 문서 버전임은 입증되지 않았다. "
        "날짜 없는 해·2020·2024는 문체부 속성을 결측 처리한다. TourAPI 보강 일정은 date_available_at을 쓴다. "
        "외부 관측·행사 연결·as_of·환산 대상 정의와 학습·보정·평가 표본은 조건부와 같고 "
        "모델·설정도 같으며 가린 피처로 다시 학습한다. 주 지표는 조건부 성적을 유지한다.",
        "",
        *metric_table(points, "year"),
        "",
        *baseline_table(points),
        "",
        "| 평가 연도 | N | 행사 속성 결측 처리 | 일정 파생 결측 처리 |",
        "|---:|---:|---:|---:|",
    ]
    for year in sorted({p["year"] for p in points}):
        rows = [p for p in points if p["year"] == year and p["model"] == "simple"]
        lines.append(
            f"| {year} | {len(rows)} | {sum(p['event_attributes_masked'] for p in rows)} | "
            f"{sum(p['schedule_attributes_masked'] for p in rows)} |"
        )
    return lines
