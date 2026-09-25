"""계약 식별자를 내용 해시로 만들고 비유한 숫자가 직렬화되는 것을 막는다."""

import hashlib
import json
from typing import Any


# 키 순서와 공백에 관계없이 동일한 내용은 동일한 바이트로 표현한다.
def canonical(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


# 종류 접두사를 유지하면서 모든 입력 내용을 식별자에 반영한다.
def identifier(prefix: str, value: Any) -> str:
    return f"{prefix}-{hashlib.sha256(canonical(value).encode()).hexdigest()}"
