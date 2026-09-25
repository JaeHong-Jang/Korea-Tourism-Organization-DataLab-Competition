"""사용 모델 포인터로 완성된 발행본만 열고 변경된 포인터를 다음 요청에 반영한다."""

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from crowdcast import paths
from crowdcast.api.contract import validate


# 누락 자료와 깨진 발행본은 서로 다른 HTTP 상태로 드러낸다.
class Unavailable(RuntimeError):
    pass


# 경로 조각만 허용해 staging·G0·상위 폴더를 조회할 수 없게 한다.
def published_path(root: Path, name: str) -> Path:
    if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9._-]*", name) or name in {"g0", ".", ".."}:
        raise FileNotFoundError("발행본 식별자가 아닙니다")
    candidate = root / name
    if candidate.resolve().parent != root.resolve():
        raise FileNotFoundError("발행본 폴더가 아닙니다")
    return candidate


# 공유 산출물은 워크트리의 후보 파일이 아닌 본 저장소에서 읽는다.
def backtest_root() -> Path:
    return paths.DATA_ROOT / "reports/backtest"


# 포인터 파일은 작으므로 매 요청 읽고 내용이 같을 때만 파싱 결과를 재사용한다.
def promoted() -> dict[str, Any]:
    try:
        raw = (backtest_root() / "promoted.json").read_bytes()
    except FileNotFoundError:
        raise Unavailable("사용 모델 포인터가 없습니다") from None
    return _pointer(raw)


# 허용된 게이트 결과와 식별자를 확인하며 후보 latest.json으로 대체하지 않는다.
@lru_cache(maxsize=4)
def _pointer(raw: bytes) -> dict[str, Any]:
    value = json.loads(raw)
    if value.get("verdict") not in {"통과", "미검증"}:
        raise ValueError("사용 모델 포인터 판정 오류")
    published_path(paths.MODELS, value["modelVersion"])
    published_path(backtest_root(), value["runId"])
    return value


# 조회 결과는 별도 가공 없이 정본 스키마로 검증한 뒤 반환한다.
def document(kind: str, name: str) -> dict[str, Any]:
    pointer = None
    if name == "latest":
        try:
            pointer = promoted()
        except Unavailable:
            raise FileNotFoundError("사용 모델 포인터가 없습니다") from None
        name = pointer["modelVersion" if kind == "model-card" else "runId"]
    root = paths.MODELS if kind == "model-card" else backtest_root()
    filename = "model_card.json" if kind == "model-card" else "backtest.json"
    result = json.loads((published_path(root, name) / filename).read_text(encoding="utf-8"))
    validate(kind if kind == "model-card" else "backtest-summary", result)
    if kind == "model-card" and result["modelVersion"] != name:
        raise ValueError("모델 카드 버전 불일치")
    if kind != "model-card" and result["runId"] != name:
        raise ValueError("백테스트 실행 식별자 불일치")
    if pointer and result["modelVersion"] != pointer["modelVersion"]:
        raise ValueError("사용 모델 버전 불일치")
    if pointer and kind == "model-card" and result["backtestRunId"] != pointer["runId"]:
        raise ValueError("사용 모델과 백테스트 실행 불일치")
    return result
