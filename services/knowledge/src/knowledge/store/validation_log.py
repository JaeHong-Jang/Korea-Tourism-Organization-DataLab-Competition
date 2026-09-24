"""검증 결과를 JSONL로 기록하고 저장된 통과 비율을 읽는다."""

import logging
from datetime import UTC, datetime
from threading import RLock

import orjson
from knowledge import paths
from knowledge.convert.documents import schema_problems

logger = logging.getLogger(__name__)
_lock = RLock()


# 기록 장애는 검증 결과를 바꾸지 않으며 한 호출을 한 줄로 직렬화한다.
def record_validation(report: dict, session_id: str, shapes: tuple[str, ...]) -> dict:
    if schema_problems(report, "gate-report"):
        logger.warning("검증 기록 생략: gate-report 계약 위반")
        return report
    record = {
        "at": datetime.now(UTC).isoformat(),
        "sessionId": session_id,
        "revision": report["revision"],
        "masterVersion": report["masterVersion"],
        "shapes": list(shapes),
        "passed": report["passed"],
    }
    try:
        with _lock:
            path = paths.STORE.parent / "validation_log.jsonl"
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open("ab") as stream:
                stream.write(orjson.dumps(record) + b"\n")
    except OSError as error:
        logger.warning("검증 기록 쓰기 실패: exception=%s", type(error).__name__)
    return report


# 기록이 없거나 읽을 수 없으면 근거 없는 통과율 대신 null을 반환한다.
def shacl_pass_rate() -> float | None:
    passed = total = 0
    try:
        with _lock, (paths.STORE.parent / "validation_log.jsonl").open("rb") as stream:
            for line in stream:
                record = orjson.loads(line)
                if not isinstance(record, dict) or type(record.get("passed")) is not bool:
                    raise ValueError("검증 기록의 passed가 불리언이 아니다")
                total += 1
                passed += record["passed"]
    except FileNotFoundError:
        return None
    except (OSError, ValueError) as error:
        logger.warning("검증 기록 읽기 실패: exception=%s", type(error).__name__)
        return None
    return passed / total if total else None
