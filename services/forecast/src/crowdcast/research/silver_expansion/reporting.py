"""저장된 실제 실험 수치로 한국어 연구 결과 보고서를 생성한다."""

import argparse
import json
from pathlib import Path


# 원본 JSON 수치를 반올림해 사람이 읽는 표를 만들되 성능 결론의 범위를 명시한다.
def write_report(output: Path, report: Path) -> None:
    summary = json.loads((output / "summary.json").read_text(encoding="utf-8"))
    verification = json.loads((output / "verification.json").read_text(encoding="utf-8"))
    folds = json.loads((output / "fold_counts.json").read_text(encoding="utf-8"))
    scores = summary["scores"]
    diagnostics = verification["models_2025_2026_only"]
    snapshot = summary["snapshot"]
    lines = [
        "# 실버 전체 후보 학습·검증 결과", "", "실행일: 2026-09-28. 상태: 연구 실행 완료, 운영 미승격.", "",
        "## 1. 결론", "",
        "1,804행을 삭제 없이 보존한 signed 지역 순증 모델을 학습했다. 같은 조건에서 SNR>3 행만 학습한 대조군보다 전체 MAE가 작았다. 유형별 중앙값 기준선과 비교한 개선은 작으며, 큰 신호·명절의 과소예측과 구간 미포함이 남는다.", "",
        "**후속 연구의 후보로 보존하되 운영 예보에 적용하지 않는다.** 2024 개발 성적에서 유형 기준선보다 MAE가 조금 나빴으므로, 설계의 ‘개발 연도에서 기준선보다 MAE·pinball 모두 개선’ 채택 조건도 충족하지 못했다. 후속 연도 성적을 보고 이 조건을 바꾸지 않았다.", "",
        "예측 대상은 시군구 일평균 방문 순증(명/일)이다. 행사장 방문객·순간 최대 인원·안전 등급의 정확도 결과가 아니다. SNR 대조군은 동일한 새 모델에서 학습행만 제한한 것이며 기존 배포 52건 모델의 재현 성적이 아니다.", "",
        "## 2. 실제 학습·보정·평가 수", "",
        "| 연도 | 첫 월 학습 | 첫 월 구간 보정 | 마지막 평가 월 학습 | 해당 연도 평가 |",
        "|---|---:|---:|---:|---:|",
    ]
    for year in (2024, 2025, 2026):
        rows = [r for r in folds["full"] if r["month"].startswith(str(year))]
        lines.append(f"| {year} | {rows[0]['train_n']:,} | {rows[0]['calibration_n']:,} | {rows[-1]['train_n']:,} | {sum(r['evaluation_n'] for r in rows):,} |")
    lines.extend([
        "", "2024년 439건은 파라미터 선택에 사용한 개발 자료다. 2025·2026 합계 993건이 선택 후의 과거 평가이며, 2026년 자료는 1~8월이다. 월별 예측 당시 공개된 자료만 학습하고 과거 예측을 다시 채점하지 않는다.", "",
        f"별도로 2026-09-28 공개 자료 전체로 연구 스냅샷을 저장했다: **학습 {snapshot['train_n']:,}행 + 구간 보정 {snapshot['calibration_n']:,}행 = 1,804행**. 학습과 보정은 겹치지 않는다. 과거 평가가 끝난 자료도 최신 스냅샷 학습에 포함되므로, 아래 과거 점수는 이 최종 스냅샷 하나의 독립 시험 성적이 아니다.", "",
        "## 3. 동일한 평가 행사에서의 오차", "",
        "MAE는 동일 시군구·기간의 총 가중치를 1로 맞춰 계산했다. 단위는 명/일이며 낮을수록 좋다.", "",
        "| 예측 방법 | 2024 개발 | 2025 평가 635행 | 2026 평가 358행 |", "|---|---:|---:|---:|",
    ])
    labels = {"zero": "순증 0 기준선", "type_median": "유형별 중앙값", "snr_filtered": "SNR>3 학습 대조군",
              "annual_split": "전체 자료·연도 분할", "full": "전체 자료·월별 분할"}
    for model, label in labels.items():
        values = [f"{scores[model][f'year_{y}']['mae']:,.1f}" if f"year_{y}" in scores[model] else "—" for y in (2024, 2025, 2026)]
        lines.append(f"| {label} | {' | '.join(values)} |")
    lines.extend(["", "| 평가 연도 | SNR 대조군 대비 MAE 감소 | 유형 중앙값 대비 MAE 감소 |", "|---|---:|---:|"])
    for year in (2025, 2026):
        full = scores["full"][f"year_{year}"]["mae"]
        improvements = [100 * (1 - full / scores[m][f"year_{year}"]["mae"]) for m in ("snr_filtered", "type_median")]
        lines.append(f"| {year} | {improvements[0]:.1f}% | {improvements[1]:.1f}% |")
    lines.extend([
        "", "지역 단위 1,000회 재표집의 보조 구간에서도 유형 기준선 대비 MAE 차이는 음수였다. 다만 공통 시기 영향과 데이터 개정까지 해소한 통계적 보장은 아니다. 2025·2026은 이전에 살펴본 자료이므로 완전히 미열람한 전향 시험이라고 부르지 않는다.", "",
        "## 4. 예측구간 및 악화 구간", "",
        "| 평가 연도 | 목표 포함률 | 실제 포함률 | 평균 구간 폭(명/일) |", "|---|---:|---:|---:|",
    ])
    for year in (2025, 2026):
        value = scores["full"][f"year_{year}"]
        lines.append(f"| {year} | 80% | {100 * value['coverage']:.1f}% | {value['mean_width']:,.0f} |")
    lines.extend([
        "", "전체 포함률만으로 모든 행사에서 구간이 충분하다고 판단할 수 없다. 아래는 2024 개발 자료를 제외한 2025·2026만의 결과다.", "",
        "| 부분집합 | 행사 행 수 | 전체학습 MAE | SNR 대조 MAE | 전체학습 평균 오차 | 전체학습 구간 포함률 |",
        "|---|---:|---:|---:|---:|---:|",
    ])
    for key, label in (("high_snr", "SNR>3 관측"), ("low_snr", "SNR≤3 관측"), ("negative", "음수 순증"), ("holiday", "명절"),
                       ("large_positive_2023_q90", "큰 양수 순증"), ("original_primary_usable_silver", "기존 대표·사용 가능 실버 교집합")):
        value, reference = diagnostics["full"][key], diagnostics["snr_filtered"][key]
        lines.append(f"| {label} | {value['n']} | {value['mae']:,.0f} | {reference['mae']:,.0f} | {value['bias']:,.0f} | {100 * value['coverage']:.1f}% |")
    lines.extend([
        "", f"큰 양수 순증은 2023년 관측 분포의 90% 분위수인 {verification['large_positive_threshold']:,.1f}명/일 이상으로 사후 진단했다. 평균 오차의 음수는 과소예측, 양수는 과대예측이다. SNR·실제 순증은 사후에만 알 수 있으므로 이 구분을 실시간 모델 선택 피처로 사용할 수 없다.", "",
        "강한 신호와 명절에서 SNR 대조군보다 악화된 점을 포함해 판단해야 한다. 음수 표본을 보존했지만 음수 구간의 과대예측도 남아 있어 방향 예측이 해결됐다고 볼 수 없다.", "",
        "## 5. 피처와 표본 처리", "",
        "- 28일 동일요일 기준으로 이미 계산된 라벨을 유지했다. SNR·음수·명절 행을 삭제하지 않았다.",
        "- 입력은 일정·유형·주야·요금·주최·회차·달력·공개 지역 방문 지표·관측일 수·자료 경과일이다.",
        "- 예산·발표 인원·전회차 인원·SNR·행사기간 실제 방문은 입력에서 제외했다.",
        "- 입력 34열에서 학습 자료만으로 결측 표시·대체·상수 제거를 적용한다. 최신 스냅샷의 실제 입력은 27열이다.",
        "- 회차 결측 990행, 지역 평균 결측 11행도 행 삭제 없이 처리했다.",
        "- 동일 관측 가중치 1/k를 학습·보정·채점에 적용하고 겹침 군집의 분할 교차를 차단했다.",
        "- 최근 군집 20%를 보정 전용으로 예약했다. 학습 파라미터는 2024년 4조합 중 num_leaves=7, min_child_samples=20으로 고정했다.",
        "- 연도 분할 대조군은 같은 signed 자료와 선택 파라미터로 Y-2까지 학습, Y-1 보정했다. SNR 대조군은 전체 모델과 보정·평가행을 동일하게 유지했다.", "",
        "## 6. 신규 행사 진단의 범위", "",
        "연도·회차를 뺀 이름과 시군구로 행사 시리즈를 임시 연결했다. D-14까지 공개된 앞선 사례가 있는지로 나눈 참고 진단이며, 사람이 검토한 신규/기존 축제 분류가 아니다.", "",
        "| 임시 분류 | 평가 행 수 | 전체학습 MAE |", "|---|---:|---:|",
    ])
    for key, label in (("prior_series_heuristic", "앞선 사례 연결"), ("no_prior_series_heuristic", "앞선 사례 미연결")):
        value = diagnostics["full"][key]
        lines.append(f"| {label} | {value['n']} | {value.get('mae', 0):,.0f} |")
    lines.extend([
        "", "## 7. 확인한 사항", "",
        "- 핵심 단위 테스트 5개 통과: 미래 관측 배제, 중복 가중치, 학습 전용 인코딩, 경계 군집, 음수 모델 저장·복원.",
        "- 실제 관측 피처 공개일 검사 5,373건 중 위반 0건.",
        "- 기존 피처와 겹치는 284행에서 지역 피처 3개 차이 0.",
        "- 평가 ID 중복 0, 학습·보정·평가 군집 교차 0, 합의한 연초 학습·보정 수 일치.",
        "- 입력 labels/events/region_daily SHA-256 실행 전후 동일.",
        "- 저장한 모델을 다시 읽어 예측값 동일 확인. 외부 API 호출·의존성 설치 없음.",
        "- 읽기 전용 교차 리뷰에서 High 없음. 강한 신호·명절의 악화 결과를 명시하라는 지적을 반영했다.",
        "- 행사 속성을 예보 요청 입력으로 알고 있다는 가정과 자료 개정 이력 미확보 한계는 남는다.", "",
        "## 8. 산출물과 재현", "",
        "연구 코드: `services/forecast/src/crowdcast/research/silver_expansion/`.",
        "실행 산출물: `reports/backtest/silver-expansion-20260928/` (원자료와 모델은 Git 제외).",
        "`summary.json`, `verification.json`, `feature_audit.json`, `selection_2024.json`, 분할 ID, 월별 예측 parquet, `models_monthly/`, `model_snapshot/`를 저장했다.", "",
        "```powershell",
        ".\\.venv\\Scripts\\python.exe -B -m unittest discover -s services/forecast/tests/research -v",
        ".\\.venv\\Scripts\\python.exe -B -m crowdcast.research.silver_expansion.run --data-root ../관광데이터_공모전/01_data/crowdcast-data-20260926-v2 --output reports/backtest/silver-expansion-rerun",
        ".\\.venv\\Scripts\\python.exe -B -m crowdcast.research.silver_expansion.diagnostics --data-root ../관광데이터_공모전/01_data/crowdcast-data-20260926-v2 --output reports/backtest/silver-expansion-rerun",
        "```", "", "기존 결과를 덮어쓰지 않도록 재실행할 때 새 output 폴더를 사용한다.", "",
        "## 9. 다음 연구의 우선순위", "",
        "1. 강한 양수 순증·명절의 과소예측 원인을 먼저 점검한다. 사후 SNR로 예측 시 모델을 골라 쓰지 않는다.",
        "2. 라벨 기준선 28일/56일·계절 추세 보정과 최신 공개 관측 창 변경을 각각 분리 실험한다.",
        "3. 한 번 본 2025·2026을 새 독립 시험으로 재사용하지 말고 향후 사전 저장 예보를 평가한다.",
        "4. 행사장 인원과 지역 순증의 연결 자료를 모아 인원 모델은 별도 검증한다.", "",
        "설계·연구 근거: [method-proposal.md](method-proposal.md), [sources.md](sources.md).", "",
    ])
    report.write_text("\n".join(lines), encoding="utf-8")


# 보고서 위치를 명시적으로 받아 연구 문서 밖의 파일을 덮어쓰지 않는다.
if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    write_report(args.output, args.report)
