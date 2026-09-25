"""사용 모델을 보존한 채 발표치 규모 후보를 학습하고 동일 폴드 승격 심사표를 저장한다."""

import argparse
import hashlib
import json
import shutil
from pathlib import Path
from typing import Any

import polars as pl
from crowdcast import paths
from crowdcast.models.__main__ import json_bytes, model_version, read_config, read_inputs
from crowdcast.models.baselines import SimpleModel
from crowdcast.models.card import backtest_markdown, validate_contract
from crowdcast.models.challenger.snapshot import load_snapshot
from crowdcast.models.evaluate import run_models
from crowdcast.models.g0 import freeze_g0, verify_qc
from crowdcast.models.publish import publish_directory, run_lock, staging
from crowdcast.models.scale_gate import promotion_review
from crowdcast.models.scale_preview import upcoming_distribution
from crowdcast.models.scale_report import assert_same_population, comparison_markdown, comparison_metrics
from crowdcast.pipeline.gates import optional_gate


# 해시는 경로와 실제 바이트를 함께 기록해 오케스트레이터가 같은 파일을 확인하게 한다.
def hashes(files: list[Path]) -> dict[str, str]:
    return {
        str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in sorted(files) if path.is_file()
    }


# 비교 실행은 기존 포인터·모델·예보에 손대지 않고 새 버전 디렉터리만 완성한다.
def execute(base_run: str, config_path: Path) -> dict[str, Any]:
    with run_lock(paths.MODELS):
        source = load_snapshot(base_run)
        baseline_points = pl.read_parquet(source.reports / "points.parquet")
        baseline_sensitivity = baseline_points.filter(
            pl.col("evaluation_definition") == "filename_sensitivity"
        ).to_dicts()
        config = read_config(config_path)
        if source.g0["primary_model"] != "simple" or not config.get("simple_announced_scale"):
            raise ValueError("사용 모델 simple·발표치 규모 계층 설정이 필요합니다")
        old_config = {**source.manifest["config"]}
        old_config["event_filename_dates"] = {
            int(k): v for k, v in old_config["event_filename_dates"].items()
        }
        if {k: v for k, v in config.items() if k != "simple_announced_scale"} != old_config:
            raise ValueError("발표치 규모 계층 이외의 설정이 사용 모델과 다릅니다")
        frames, qc, input_hashes = read_inputs(paths.PROCESSED)
        if input_hashes != source.manifest["input_hashes"]:
            raise ValueError("비교 도중 입력 스냅샷이 변경되었습니다")
        verify_qc(qc, frames["labels"], frames["events"].to_dicts())

        # 기존 모델·실제 예보·입력·완료 포인터는 시작과 끝의 바이트 해시를 대조한다.
        pointers = [paths.REPORTS / "backtest" / f"{name}.json" for name in ("promoted", "latest")]
        pointer = json.loads(pointers[0].read_bytes())
        if pointer["runId"] != base_run:
            raise ValueError("비교 기준은 현재 사용 모델이어야 합니다")
        protected = [*source.directory.rglob("*"), *source.hashes, *pointers]
        protected += [
            paths.PROCESSED / name
            for name in (
                "upcoming.parquet",
                "upcoming_forecasts.jsonl",
                "upcoming_qc.md",
                "features_availability.json",
                "labels.parquet",
                "events.parquet",
                "region_daily.parquet",
                "labels_g0.json",
            )
        ]
        preserved = hashes(protected)
        version = model_version(input_hashes, config)
        run_id = "bt-" + version
        directory, reports = paths.MODELS / version, paths.REPORTS / "backtest" / run_id
        g0_path = freeze_g0(paths.MODELS / "g0" / version, qc, input_hashes, config["eval_years"], version)

        # 기존 롤링 백테스트를 그대로 실행하며 피처 감사도 후보 폴더 안에만 기록한다.
        with staging(directory) as model_stage, staging(reports) as report_stage:
            shutil.copy2(g0_path, model_stage / "g0.json")
            result, card, summary, excluded = run_models(
                frames,
                config,
                g0_path,
                input_hashes,
                model_stage,
                reports,
                version,
                audit_path=model_stage / "availability.json",
            )
            assert_same_population(source.manifest["folds"], result["folds"], source.points, result["points"])
            assert_same_population(
                source.manifest["folds"],
                result["sensitivity"]["folds"],
                baseline_sensitivity,
                result["sensitivity"]["points"],
            )
            if (directory / "model_card.json").exists():
                card["createdAt"] = json.loads((directory / "model_card.json").read_bytes())["createdAt"]
            validate_contract("model-card", card)
            validate_contract("backtest-summary", summary)
            (model_stage / "model_card.json").write_bytes(json_bytes(card))
            (report_stage / "backtest.json").write_bytes(json_bytes(summary))
            (report_stage / "backtest.md").write_text(
                backtest_markdown(result, card, excluded, input_hashes, (base_run, source.points)),
                encoding="utf-8",
            )
            points = [
                {**point, "evaluation_definition": definition}
                for definition, evaluation in (
                    ("conditional", result),
                    ("filename_sensitivity", result["sensitivity"]),
                )
                for point in evaluation["points"]
            ]
            pl.DataFrame(points, infer_schema_length=None).write_parquet(report_stage / "points.parquet")
            manifest = {
                "model_version": version,
                "run_id": run_id,
                "input_hashes": input_hashes,
                "config": config,
                "folds": result["folds"],
                "excluded": excluded,
                "golden_skipped": result["golden_skipped"],
                "comparison_run_id": base_run,
                "supersedes": source.directory.name,
                "candidate_only": True,
            }
            (model_stage / "run.json").write_bytes(json_bytes(manifest))

            # 자동 승격 함수는 호출하지 않고 읽기 전용인 기존 게이트 판정만 이용한다.
            previous = json.loads((source.reports / "backtest.json").read_bytes())
            gate = optional_gate("backtest", [report_stage / "backtest.json"], previous)
            preview = upcoming_distribution(
                SimpleModel.load(model_stage / "simple.json"),
                SimpleModel.load(source.directory / "simple.json"),
                source.events,
                card["features"],
                config,
                source.g0["basis"],
            )
            evaluations = {
                definition: {"v1": comparison_metrics(before), "candidate": comparison_metrics(after)}
                for definition, before, after in (
                    ("conditional", source.points, result["points"]),
                    ("filename_sensitivity", baseline_sensitivity, result["sensitivity"]["points"]),
                )
            }
            source.verify()
            if hashes(protected) != preserved:
                raise ValueError("비교 중 사용 모델·포인터·입력·기존 예보 바이트 변경")
            comparison = {
                "baseRunId": base_run,
                "baseModelVersion": source.directory.name,
                "runId": run_id,
                "modelVersion": version,
                "metrics": evaluations["conditional"],
                "evaluations": evaluations,
                "sameFoldsAndLabels": True,
                "gate": gate,
                **promotion_review(gate, evaluations, preview),
                "upcoming": preview,
                "preservedHashes": preserved,
            }
            (report_stage / "comparison.json").write_bytes(json_bytes(comparison))
            (report_stage / "comparison.md").write_text(comparison_markdown(comparison), encoding="utf-8")

            # 후보 파일 해시를 남긴 뒤 포인터 변경 없이 두 불변 디렉터리만 저장한다.
            artifacts = {}
            for root, prefix in (
                (model_stage, f"models/{version}"),
                (report_stage, f"reports/backtest/{run_id}"),
            ):
                artifacts.update(
                    {
                        f"{prefix}/{path.relative_to(root)}": digest
                        for name, digest in hashes(list(root.rglob("*"))).items()
                        if (path := Path(name)).name != "artifact_hashes.json"
                    }
                )
            (model_stage / "artifact_hashes.json").write_bytes(json_bytes(artifacts))
            publish_directory(model_stage, directory)
            publish_directory(report_stage, reports)
        return {
            "runId": run_id,
            "modelVersion": version,
            "gate": gate,
            "recommendation": comparison["recommendation"],
            "promotionEligible": comparison["promotionEligible"],
            "recallSafety": comparison["recallSafety"],
            "metrics": comparison["metrics"],
            "evaluations": evaluations,
            "upcoming": preview,
        }


# 반복 평가에서도 사용 모델을 명시하고 일반 파이프라인의 승격·일괄 발행 경로를 호출하지 않는다.
def main() -> None:
    parser = argparse.ArgumentParser(description="발표치 규모 후보 비교 — 포인터·기존 예보 보존")
    parser.add_argument("--base-run", required=True)
    parser.add_argument("--config", type=Path, default=paths.REPO_ROOT / "configs/model.yaml")
    arguments = parser.parse_args()
    print(json.dumps(execute(arguments.base_run, arguments.config), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
