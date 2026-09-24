"""백테스트 산출물을 잠금 안에서 임시 폴더로 완성해 한 번에 드러내고 완료 포인터 하나만 마지막에 바꾼다."""

import fcntl
import hashlib
import json
import os
import shutil
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path


# 같은 저장소의 백테스트는 한 번에 하나만 돌려 임시 폴더·포인터가 서로 덮이지 않게 한다.
@contextmanager
def run_lock(models: Path) -> Iterator[None]:
    models.mkdir(parents=True, exist_ok=True)
    with (models / ".backtest.lock").open("w") as handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError("다른 백테스트 실행 중 — 끝난 뒤 다시 실행") from None
        yield


# 실행 중 실패하면 임시 폴더만 지우고 이미 드러난 폴더는 건드리지 않는다(잠금 안에서만 쓴다).
@contextmanager
def staging(final: Path) -> Iterator[Path]:
    stage = final.with_name(f".staging-{final.name}")
    shutil.rmtree(stage, ignore_errors=True)
    stage.mkdir(parents=True)
    try:
        yield stage
    finally:
        shutil.rmtree(stage, ignore_errors=True)


# 폴더 안 파일의 경로·바이트를 한 값으로 묶어 발행본과 재실행 결과를 비교한다.
def tree_digest(root: Path, skip: frozenset[str]) -> str:
    digest = hashlib.sha256()
    for path in sorted(root.rglob("*")):
        if path.is_file() and path.name not in skip:
            digest.update(str(path.relative_to(root)).encode() + b"\0" + path.read_bytes() + b"\0")
    return digest.hexdigest()


# 없는 폴더는 완성된 임시 폴더를 한 번에 옮겨 드러내고, 이미 있는 폴더는 같은 내용인지만 확인한다.
def publish_directory(stage: Path, final: Path, volatile: frozenset[str] = frozenset()) -> None:
    if final.exists():
        if tree_digest(stage, volatile) != tree_digest(final, volatile):
            raise RuntimeError(
                f"발행된 {final.name}와 같은 버전 재실행 결과가 다르다 — 발행본은 바꾸지 않는다"
            )
        return
    stage.rename(final)


# 완성된 임시 파일을 디스크에 내린 뒤 원자적으로 바꾸고, 실패하면 임시 파일을 지운다.
def write_atomic(path: Path, content: bytes) -> None:
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    try:
        with temporary.open("wb") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


# 발행될 경로 이름으로 불변 산출물의 해시를 임시 폴더 안에서 먼저 기록한다(포인터 파일은 제외).
def write_artifact_hashes(
    models_stage: Path,
    reports_stage: Path,
    names: tuple[str, str],
    audit: Path,
) -> None:
    hashes = {}
    for root, prefix in (
        (models_stage, f"models/{names[0]}"),
        (reports_stage, f"reports/backtest/{names[1]}"),
    ):
        for path in sorted(root.rglob("*")):
            if path.is_file() and path.name != "artifact_hashes.json":
                hashes[f"{prefix}/{path.relative_to(root)}"] = hashlib.sha256(path.read_bytes()).hexdigest()
    hashes["data/processed/features_availability.json"] = hashlib.sha256(audit.read_bytes()).hexdigest()
    (models_stage / "artifact_hashes.json").write_text(
        json.dumps(hashes, ensure_ascii=False, sort_keys=True, indent=2) + "\n", encoding="utf-8"
    )
