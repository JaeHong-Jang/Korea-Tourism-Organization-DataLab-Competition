"""대표 이미지 색인과 로컬 파일을 읽어 API의 파일·출처를 제공한다."""

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from crowdcast import paths
from crowdcast.data.call_ledger import atomic_write

# 계약에서 허용한 이미지 형식만 저장·제공하고 행사 ID를 파일 경계로 사용한다.
MEDIA_TYPES = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
EVENT_ID = re.compile(r"e-[a-z0-9][a-z0-9_.:-]{1,120}")
MAX_BYTES = 5 * 1024 * 1024


# 파일과 출처를 함께 반환해 목록의 이미지 표시와 실제 제공 조건을 일치시킨다.
@dataclass(frozen=True)
class CachedImage:
    path: Path
    content_type: str
    copyright: str | None

    # 알려진 공공누리 코드만 유형으로 풀고 미확인 코드는 추측하지 않는다.
    @property
    def credit(self) -> str:
        value = self.copyright or ""
        match = re.fullmatch(r"(?:Type|제)?([1-4])(?:유형)?", value, re.IGNORECASE)
        label = f"공공누리 제{match[1]}유형" if match else value or "공공누리 유형 미상"
        return f"한국관광공사 TourAPI · {label}"


# 실행 시점의 데이터 루트를 사용해 워크트리와 테스트 경로를 분리한다.
def cache_directory() -> Path:
    return paths.CACHE / "images"


# 색인이 없으면 빈 캐시이며 손상된 색인은 덮어쓰지 않도록 오류로 드러낸다.
def read_index(directory: Path) -> dict[str, dict[str, Any]]:
    try:
        index = json.loads((directory / "index.json").read_bytes())
    except FileNotFoundError:
        return {}
    if not isinstance(index, dict) or any(not isinstance(entry, dict) for entry in index.values()):
        raise ValueError("이미지 색인 형식 오류")
    return index


# 받기가 끝난 파일만 원자적으로 색인에 발행한다.
def write_index(directory: Path, index: dict[str, dict[str, Any]]) -> None:
    atomic_write(directory / "index.json", json.dumps(index, ensure_ascii=False, sort_keys=True).encode())


# 색인의 경로·형식·실제 파일을 확인해 캐시 밖 파일과 누락된 파일을 노출하지 않는다.
def cached_image(directory: Path, index: dict[str, dict[str, Any]], event_id: str) -> CachedImage | None:
    if not EVENT_ID.fullmatch(event_id):
        return None
    entry = index.get(event_id, {})
    filename = entry.get("file")
    if not isinstance(filename, str):
        return None
    suffix = Path(filename).suffix.lower()
    content_type = MEDIA_TYPES.get(suffix)
    if filename != event_id + Path(filename).suffix or not content_type:
        return None
    if entry.get("content_type") != content_type:
        return None
    copyright_code = entry.get("copyright")
    if copyright_code is not None and not isinstance(copyright_code, str):
        return None
    path = directory / filename
    try:
        if path.is_symlink() or not path.is_file() or not 0 < path.stat().st_size <= MAX_BYTES:
            return None
    except OSError:
        return None
    return CachedImage(path, content_type, copyright_code)


# 선택 이미지의 색인이 손상돼도 예보 자체는 유지하고 이미지 링크만 생략한다.
def available_index(directory: Path) -> dict[str, dict[str, Any]]:
    try:
        return read_index(directory)
    except (OSError, ValueError):
        return {}


# 일괄 예보 파일을 수정하지 않고 조회된 요약에만 로컬 이미지 링크를 붙인다.
def attach_images(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    directory = cache_directory()
    index = available_index(directory)
    return [
        {**row, "image": {"url": f"/api/images/{row['eventId']}", "credit": image.credit}}
        if (image := cached_image(directory, index, row["eventId"])) else row
        for row in rows
    ]
