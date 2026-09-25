"""운영 기록의 식별자와 산출물 경로를 제한하고 문장 속 로컬 절대 경로를 가린다."""

import re
from functools import lru_cache
from pathlib import Path, PurePosixPath, PureWindowsPath

from crowdcast import paths


# 실행 식별자는 디렉터리 한 조각만 허용하고 링크로 실행 저장소를 벗어나지 못하게 한다.
def record_path(run_id: str) -> Path:
    if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9._+-]*", run_id):
        raise ValueError("실행 식별자 형식 오류")
    root = paths.REPORTS / "runs"
    directory = root / run_id
    target = directory / "run.json"
    if directory.resolve().parent != root.resolve() or target.resolve().parent != directory.resolve():
        raise ValueError("실행 기록 경로 오류")
    return target


# 기록에는 세 공개 산출물 루트 아래의 상대 경로만 허용한다.
def relative_artifact(value: str) -> bool:
    path = PurePosixPath(value)
    return (
        not path.is_absolute()
        and not PureWindowsPath(value).drive
        and "\\" not in value
        and ".." not in path.parts
        and len(path.parts) > 1
        and path.parts[0] in {"data", "models", "reports"}
    )


# 고정된 공유 루트의 링크 해석은 재사용해 기록 문장마다 느린 공유 디스크를 조회하지 않는다.
@lru_cache(maxsize=8)
def _root_labels(roots: tuple[tuple[Path, str], ...]) -> list[tuple[str, str]]:
    replacements = {str(p): label for root, label in roots for p in (root, root.resolve())}
    return sorted(replacements.items(), key=lambda item: len(item[0]), reverse=True)


# 알려진 공유 루트는 상대 표기로 바꾸고 나머지 절대 경로는 응답 문장에서 지운다.
def public_text(value: str) -> str:
    roots = (
        (paths.DATA, "data"),
        (paths.MODELS, "models"),
        (paths.REPORTS, "reports"),
        (paths.REPORTS / "runs", "reports/runs"),
        (paths.REPORTS / "backtest", "reports/backtest"),
        (paths.REPO_ROOT, "[저장소]"),
        (paths.DATA_ROOT, "[자료 저장소]"),
    )
    for root, label in _root_labels(roots):
        value = value.replace(root + "/", label + "/").replace(root + "\\", label + "/")
        value = value.replace(root, label)
    return re.sub(r"(?<![\w:/])(?:[A-Za-z]:[\\/]|\\\\|/(?!\{))[^\s,;\"'<>|)]+", "[로컬 경로]", value)
