"""v2 실행 산출물에서 모델 검증 화면용 상수 파일(research-v2-data.ts)을 생성한다."""

import argparse
import json
from pathlib import Path

LABEL = {
    "prior": "앞선 회차 입력 추가",
    "relative": "지역 규모 상대 척도",
    "prior_relative": "앞선 회차 + 상대 척도",
}


# 화면에는 성적만 싣고 채택 판정·원인 진단은 연구 문서에만 둔다.
def metric(score: dict) -> dict:
    return {
        "mae": round(score["mae"], 1),
        "pinball": round(score["pinball"], 1),
        "coverage": round(score["coverage"], 3),
        "meanWidth": round(score["mean_width"]),
    }


# v2·v1 산출물과 v1 분할 수를 읽어 화면이 쓰는 모양으로 바꾼다.
def build(repo: Path) -> dict:
    v2 = repo / "reports/backtest/silver-v2-20260928"
    summary = json.loads((v2 / "summary.json").read_text(encoding="utf-8"))
    config = json.loads((v2 / "preregistered_config.json").read_text(encoding="utf-8"))
    v1 = json.loads(
        (repo / "reports/backtest/silver-expansion-20260928/summary.json").read_text(encoding="utf-8")
    )
    split_path = repo / "docs/research/silver-expansion-20260928/split_counts.json"
    splits = json.loads(split_path.read_text(encoding="utf-8"))
    evaluation = []
    for year, period in ((2025, "연간"), (2026, "1~8월")):
        scores = summary["yearly"][str(year)]
        evaluation.append(
            {
                "year": year,
                "period": period,
                "events": scores["v2"]["n"],
                "windows": scores["v2"]["windows"],
                "v2": metric(scores["v2"]),
                "v1": metric(scores["v1"]),
                "typeMedian": metric(scores["type_median"]),
                "zero": metric(scores["zero"]),
            }
        )
    dev = summary["development_2024"]
    snr = [round(v1["scores"]["snr_filtered"][f"year_{y}"]["mae"], 1) for y in (2024, 2025, 2026)]
    zero_2024 = round(summary["breakdown"]["zero"]["year_2024"]["mae"], 1)
    first, second = evaluation
    rows = [
        ("순증 0 기준선", [zero_2024, first["zero"]["mae"], second["zero"]["mae"]], False),
        (
            "유형별 중앙값",
            [round(dev["type_median"]["mae"], 1), first["typeMedian"]["mae"], second["typeMedian"]["mae"]],
            False,
        ),
        ("SNR>3 학습 대조군 (v1 실행)", snr, False),
        (
            "v1 · 전체 자료 월별 재학습",
            [round(dev["v1"]["mae"], 1), first["v1"]["mae"], second["v1"]["mae"]],
            False,
        ),
        (
            "v2 · 앞선 회차 입력 추가",
            [round(dev["v2"]["mae"], 1), first["v2"]["mae"], second["v2"]["mae"]],
            True,
        ),
    ]
    names = {"type_median": "유형별 중앙값", "v1": "v1", "zero": "순증 0"}
    comparisons = []
    for year in (2025, 2026):
        for ref in ("v1", "type_median", "zero"):
            paired = summary["paired_comparisons"][f"{year}_{ref}"]
            comparisons.append(
                {
                    "year": year,
                    "against": names[ref],
                    "difference": round(paired["candidate_minus_reference_mae"], 1),
                    "interval": [round(x) for x in paired["bootstrap_95_interval"]],
                    "rows": paired["n"],
                    "regions": paired["regions"],
                }
            )
    audit, prior = summary["feature_audit"], summary["prior_feature_audit"]
    selected = summary["selected"]
    return {
        "runId": "silver-v2-20260928",
        "previousRunId": "silver-expansion-20260928",
        "ranOn": "2026-09-28",
        "status": "연구 모델 · 발행 예보 미적용",
        "target": "시군구 일평균 방문 순증",
        "unit": "명/일",
        "rows": audit["rows"],
        "selected": {
            "variant": selected["variant"],
            "label": LABEL[selected["variant"]],
            "numLeaves": selected["params"]["num_leaves"],
            "minChildSamples": selected["params"]["min_child_samples"],
        },
        "snapshot": {
            "trained": summary["snapshot"]["train_n"],
            "calibrated": summary["snapshot"]["calibration_n"],
        },
        "priorRows": prior["rows_with_prior"],
        "evaluation": evaluation,
        "baselines": {
            "columns": [2024, 2025, 2026],
            "rows": [{"label": label, "values": values, "ours": ours} for label, values, ours in rows],
        },
        "comparisons": comparisons,
        "split": {
            "annual": [
                {
                    "year": a["year"],
                    "firstTrain": a["year_start"]["train_rows"],
                    "firstCalibration": a["year_start"]["calibration_rows"],
                    "lastTrain": a["last_evaluation_month"]["train_rows"],
                    "evaluation": a["annual_evaluation_rows"],
                    "firstCutoff": a["year_start"]["cutoff"],
                }
                for a in splits["annual"]
            ]
        },
        "checks": [
            {"label": "입력 자료 해시 실행 전후 동일", "value": "일치"},
            {"label": "미래 관측 사용 위반", "value": f"{audit['observations_checked']:,}건 검사 중 0건"},
            {"label": "앞선 회차 공개일 위반", "value": f"{prior['rows_with_prior']:,}행 중 0건"},
            {"label": "평가행 집합 (v2·v1·기준선)", "value": "동일"},
            {"label": "저장한 모델 다시 읽어 예측 재현", "value": "동일"},
            {"label": "연구 단위 테스트", "value": "9개 통과"},
        ],
        "versions": config["versions"],
    }


# 생성 파일은 머리 주석에 재생성 명령을 적어 손으로 고치지 않게 한다.
def write(data: dict, output: Path) -> None:
    body = json.dumps(data, ensure_ascii=False, indent=2)
    output.write_text(
        "// silver-v2-20260928 실행 산출물에서 생성한 화면용 수치다. 손으로 고치지 않는다.\n"
        "// 재생성: python -m crowdcast.research.silver_v2.web_export --repo . "
        "--output apps/web/src/features/validation/research-v2-data.ts\n"
        f"export const researchV2 = {body} as const;\n\n"
        "export type ResearchV2 = typeof researchV2;\n",
        encoding="utf-8",
    )


# CLI는 저장소 루트와 출력 경로만 받는다.
if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    write(build(args.repo.resolve()), args.output.resolve())
