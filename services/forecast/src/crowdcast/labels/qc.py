"""라벨 모집단·학습 제외·미매칭과 현재 G0 상태를 재현 가능한 Markdown으로 기록한다."""

import json
from collections import Counter
from typing import Any

import holidays
import polars as pl
from crowdcast.labels.g0 import g0_lines
from crowdcast.labels.schema import DECIMALS, GOLD_LAG_DAYS, VISITORS_LAG_DAYS
from crowdcast.labels.silver_qc import silver_lines


# 후보는 수치 계산이 가능한 모든 실버이며 음수·저신호·골든 필터보다 앞에서 센다.
def quality_report(
    labels: pl.DataFrame,
    event_count: int,
    excluded: Counter[str],
    unmatched: list[dict[str, Any]],
    skipped: list[dict[str, Any]],
    golden: set[str],
    template_rows: int,
    audit: dict[str, Any],
) -> str:
    silver = labels.filter(pl.col("label_tier") == "silver")
    usable = silver.filter(pl.col("is_primary") & pl.col("usable_for_training")).height
    lines = [
        "# 라벨 QC",
        "",
        "참고용 — 담당자 검토 필수. 실버는 추정 산식 기반 보조 정답.",
        f"전체 {labels.height}행 / 고유 event_id {labels['event_id'].n_unique()}건.",
        f"DIY 템플릿 {template_rows}행. 골든 지정 {len(golden)}건 / "
        f"라벨에 있는 골든 {labels.filter(pl.col('is_golden'))['event_id'].n_unique()}건.",
        "골든 미지정 시 0건이며 events.is_golden 대신 이번 실행의 --golden-file만 적용한다.",
        "",
        "## 등급 × 연도",
        "",
        "| 등급 | 연도 | 전체 | 대표 | 학습 가능 | 골든 |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for tier in ("goldA", "goldB", "silver"):
        for year in sorted(labels["year"].unique().to_list()):
            group = labels.filter((pl.col("label_tier") == tier) & (pl.col("year") == year))
            lines.append(
                f"| {tier} | {year} | {group.height} | {group['is_primary'].sum()} | "
                f"{group.filter(pl.col('is_primary') & pl.col('usable_for_training')).height} | "
                f"{group['is_golden'].sum()} |"
            )

    # G0와 실버 부호 검사는 기계용 JSON과 동일한 집계 객체를 표시한다.
    lines += g0_lines(audit["g0"]) + silver_lines(audit["silver"])

    # 구조적 제외와 후보 이후 제외를 나눠 저신호를 제거한 뒤 음수율을 낮추는 일을 막는다.
    lines += [
        "",
        "## 실버 후보와 제외",
        "",
        f"입력 행사 {event_count}건 → 계산 가능 후보 {silver.height}건 → 대표·학습 가능 {usable}건.",
        "계산 불가 행사는 음수 여부를 알 수 없어 분모에서 제외한다. "
        "후보에는 골든·음수·저신호·명절을 모두 포함한다. 부호 검사는 반올림 전 수치를 사용한다.",
        "구조적 제외는 일정→기간→코드→연속성→기간 관측→기준선 순 첫 사유 하나.",
        "",
        "| 계산 전 제외 사유 | 건수 |",
        "|---|---:|",
    ]
    lines += [f"| {reason} | {count} |" for reason, count in sorted(excluded.items())]
    rejected = Counter(
        "비대표" if not row["is_primary"] else ("골든" if row["is_golden"] else row["quality_flag"])
        for row in silver.iter_rows(named=True)
        if not (row["is_primary"] and row["usable_for_training"])
    )
    lines += ["", "| 후보 중 학습 제외 사유(비대표·골든 우선, 나머지 조합별) | 건수 |", "|---|---:|"]
    lines += [f"| {reason} | {count} |" for reason, count in sorted(rejected.items())]
    lines += [
        "",
        "## 산식·단위·공개 시점",
        "",
        f"골드A available_at = 종료일 + {GOLD_LAG_DAYS}일(가정). "
        f"골드B = max(종료일 + {GOLD_LAG_DAYS}일(가정), diy_checked_at). "
        f"실버 = 종료일 + {VISITORS_LAG_DAYS}일(API 반영 지연).",
        "골드B 확인일 미입력은 라벨을 만들지 않고 DIY 미완성에 기록한다. "
        "diy_area_matches_venue는 예/아니오; 아니오·빈칸은 지정영역으로 남아 G0에서 제외된다.",
        "종료일 미상 골드는 보존하되 available_at=null·학습 제외한다.",
        "daily_mean·local·nonlocal·foreign는 명/일; total은 기간 합계, days는 일. "
        "time_unit=일은 학습 대상 daily_mean과 구분별 일평균에 적용한다.",
        "골드A 구분별 값은 원본 기간 합계/일수. 골드B 구분별 미제공 값은 null.",
        "실버 구분별 순증은 각 구분의 같은 요일 중앙값을 차감한다. "
        "중앙값은 가산적이지 않아 구분별 합과 전체 순증은 다를 수 있다.",
        "기준선은 [시작일−28일, 시작일−1일]에 고정; 필요한 요일마다 공휴일 제외 ≥3일. "
        "필요한 요일의 잔차를 중복 없이 모은 표본 표준편차(ddof=1)를 SNR 분모로 사용.",
        "σ>0이며 순증 > 3σ만 학습 가능(경계 제외). σ=0은 snr=null·zero_sigma·학습 제외. "
        "학습 표본 수는 is_primary & usable_for_training 기준. 부모 시는 원본 부모 합계만 사용.",
        f"공휴일: holidays=={holidays.__version__}, KR(대체·임시 공휴일 포함). 외부 API 호출 0건.",
        "골드A 시도: 명시 열 또는 동반 목적지 검색순위 CSV의 축제명과 일치하는 목적지 주소. "
        "시도 근거가 없거나 상충하면 미매칭; 마스터만 보고 시도를 추측하지 않는다.",
        "source_file은 data 기준 상대경로. source_row는 CSV 헤더 포함 1기반 행 번호, "
        "실버는 행사 기간과 실제 기준선에 사용한 Parquet 물리 행(1기반)의 JSON 배열.",
        f"정렬=event_id·등급 우선순위(B>A>silver)·출처·행. 수치=소수 {DECIMALS}자리 "
        "Python round(짝수 반올림), -0은 0. 3σ 판정은 반올림 전 수치 사용.",
        "is_primary는 사용 가능 여부와 별개인 등급 우선순위다. 학습 시 두 플래그를 함께 확인한다.",
        f"코로나(2020·2021) {labels.filter(pl.col('covid_period')).height}행은 표시만 함; "
        "코로나라는 이유로 제외한 행 0건, 제외 판단은 T-203.",
    ]

    # 필터 뒤 사라지기 쉬운 품질 문제와 연결 실패를 원본 위치와 함께 전부 노출한다.
    lines += ["", "## 품질 플래그", "", "| 등급 | 플래그 | 건수 |", "|---|---|---:|"]
    counts = Counter((row["label_tier"], row["quality_flag"]) for row in labels.iter_rows(named=True))
    lines += [f"| {tier} | {reason} | {count} |" for (tier, reason), count in sorted(counts.items())]
    lines += ["", f"## 미매칭 ({len(unmatched)}건)", ""]
    lines += [json.dumps(row, ensure_ascii=False, sort_keys=True) for row in unmatched] or ["없음"]
    lines += ["", f"## DIY 미완성 ({len(skipped)}건)", ""]
    lines += [json.dumps(row, ensure_ascii=False, sort_keys=True) for row in skipped] or ["없음"]
    return "\n".join(lines) + "\n"
