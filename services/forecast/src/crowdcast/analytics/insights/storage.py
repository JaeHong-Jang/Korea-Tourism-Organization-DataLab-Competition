"""검증한 인사이트 묶음을 원자적으로 교체하고 API에는 저장 JSON만 제공한다."""

import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any

from crowdcast import paths
from crowdcast.api.contract import validate

KEYS = tuple(f"I{number}" for number in range(1, 7))


# 일곱 응답 모두 계약을 통과하기 전에는 기존 파일을 하나도 교체하지 않는다.
def publish(outputs: dict[str, dict[str, Any]]) -> list[Path]:
    if set(outputs) != {*KEYS, "datalab-spec"}:
        raise ValueError("인사이트 발행에는 JSON 일곱 개가 필요합니다")
    contents = {}
    for key, result in outputs.items():
        validate("datalab-spec" if key == "datalab-spec" else "insight", result)
        if key in KEYS and result["key"] != key:
            raise ValueError("인사이트 파일명·키 불일치")
        contents[key] = (json.dumps(result, ensure_ascii=False, allow_nan=False, indent=2) + "\n").encode()
    directory = paths.PROCESSED / "insights"
    directory.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(prefix=".staging-", dir=directory) as temporary:
        staging, replaced = Path(temporary), []
        for key, content in contents.items():
            (staging / f"{key}.json").write_bytes(content)
            target = directory / f"{key}.json"
            if target.exists():
                (staging / f"{key}.previous").write_bytes(target.read_bytes())
        try:
            for key in contents:
                os.replace(staging / f"{key}.json", directory / f"{key}.json")
                replaced.append(key)
        except BaseException:
            for key in reversed(replaced):
                previous = staging / f"{key}.previous"
                if previous.exists():
                    os.replace(previous, directory / f"{key}.json")
                else:
                    (directory / f"{key}.json").unlink()
            raise
    return [directory / f"{key}.json" for key in contents]


# 요청 경로를 파일 경로로 임의 확장하지 않고 허용된 저장 결과만 읽는다.
def read(key: str) -> dict[str, Any]:
    if key not in (*KEYS, "datalab-spec"):
        raise FileNotFoundError("지원하지 않는 인사이트 키입니다")
    path = paths.PROCESSED / "insights" / f"{key}.json"
    if not path.is_file():
        raise FileNotFoundError(f"{key} 저장 결과가 없습니다. 인사이트 CLI를 먼저 실행해야 합니다")
    result = json.loads(path.read_bytes())
    validate("datalab-spec" if key == "datalab-spec" else "insight", result)
    if key in KEYS and result["key"] != key:
        raise ValueError("저장된 인사이트 키 불일치")
    return result
