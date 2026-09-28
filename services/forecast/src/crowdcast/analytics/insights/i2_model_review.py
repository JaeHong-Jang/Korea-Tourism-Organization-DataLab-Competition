"""현재 입력 자료와 일치하는 완료된 모델 실험만 인사이트 근거에 연결한다."""

import hashlib
import json
from typing import Any

from crowdcast import paths


# 다른 학습 자료로 얻은 점수를 현재 예보 정확도처럼 표시하지 않는다.
def model_review() -> dict[str, Any] | None:
    try:
        return read_review()
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        # 선택적인 실험 기록 오류가 이미 발행된 예보의 조회까지 막지 않게 한다.
        return None


# 현재 입력의 해시와 실험 완료 상태를 확인하고 필요한 점수만 전달한다.
def read_review() -> dict[str, Any] | None:
    path = paths.PROCESSED / "insight_model_experiment.json"
    if not path.is_file():
        return None
    result = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(result, dict):
        return None
    for key in ("labels", "events", "region_daily", "labels_g0"):
        file = paths.PROCESSED / (f"{key}.json" if key == "labels_g0" else f"{key}.parquet")
        if not file.is_file() or hashlib.sha256(file.read_bytes()).hexdigest() != result.get(
            "inputHashes", {}
        ).get(key):
            return None
    if result.get("promoted") is not False or not result.get("evaluations"):
        return None
    return {
        **{key: result[key] for key in ("runId", "computedAt", "status", "promoted", "limitations")},
        "evaluations": [
            {
                "candidate": row["candidate"],
                "definition": row["definition"],
                "scores": row["scores"],
                "years": [fold["year"] for fold in row["folds"] if fold["skipped"] is None],
            }
            for row in result["evaluations"]
        ],
    }
