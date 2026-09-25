"""도전 모델을 별도 폴더에 완성하며 사용·후보 포인터와 기존 발행본은 쓰지 않는다."""

import time
from typing import Any

from crowdcast import paths
from crowdcast.models.card import challenger_card, validate_contract
from crowdcast.models.challenger.backtest import compare
from crowdcast.models.challenger.config import ChallengerConfig
from crowdcast.models.challenger.report import artifact_hashes, json_bytes, markdown
from crowdcast.models.challenger.snapshot import child, load_snapshot
from crowdcast.models.publish import publish_directory, run_lock, staging


# 기본 모델과 같은 저장소 잠금을 사용하되 완료 포인터는 만들거나 바꾸지 않는다.
def execute(run_id: str, config: ChallengerConfig | None = None) -> dict[str, Any]:
    started = time.monotonic()
    config = config or ChallengerConfig()
    with run_lock(paths.MODELS):
        source = load_snapshot(run_id)
        destination = child(paths.MODELS, source.directory.name + "-challenger")
        reports = child(source.reports, "challenger")
        with staging(destination) as models_stage, staging(reports) as reports_stage:
            comparison = compare(source, models_stage, config)
            comparison["sourceArtifacts"] = {
                str(path.relative_to(paths.DATA_ROOT)): digest for path, digest in source.hashes.items()
            }
            card = challenger_card(source.card, comparison)
            validate_contract("model-card", card)
            (models_stage / "model_card.json").write_bytes(json_bytes(card))
            (reports_stage / "comparison.json").write_bytes(json_bytes(comparison))
            (reports_stage / "comparison.md").write_text(markdown(comparison), encoding="utf-8")
            elapsed = time.monotonic() - started
            (reports_stage / "execution.json").write_bytes(json_bytes({"elapsedSeconds": elapsed}))
            hashes = artifact_hashes(models_stage, reports_stage, destination.name, run_id)
            (models_stage / "artifact_hashes.json").write_bytes(json_bytes(hashes))
            source.verify()
            # 두 폴더가 이미 있으면 재실행 결과를 먼저 모두 확인해 다른 설정의 부분 발행을 막는다.
            for stage, final in ((reports_stage, reports), (models_stage, destination)):
                if final.exists():
                    publish_directory(stage, final, frozenset({"execution.json", "artifact_hashes.json"}))
            publish_directory(models_stage, destination, frozenset({"artifact_hashes.json"}))
            publish_directory(reports_stage, reports, frozenset({"execution.json"}))
    return {
        "modelVersion": destination.name,
        "baseRunId": run_id,
        "elapsedSeconds": elapsed,
        "metrics": comparison["metrics"],
        "models": str(destination),
        "reports": str(reports),
    }
