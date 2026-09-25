"""전체 지도의 파일 노드만 경로별로 묶어 표시 크기를 제한한다."""

from collections import defaultdict
from hashlib import sha256
from pathlib import PurePosixPath

MAX_NODES = 600


# 한도를 넘을 때만 동일 경로부터 상위 폴더 순으로 합치며 모든 파일의 연결을 보존한다.
def compact_files(nodes: dict[str, dict], paths: dict[str, str]) -> tuple[dict[str, dict], dict[str, str]]:
    if len(nodes) <= MAX_NODES:
        return nodes, {}
    retained = {identifier: node for identifier, node in nodes.items() if identifier not in paths}
    budget = MAX_NODES - len(retained)
    if not paths or budget < 1:
        raise ValueError("파일을 제외한 전체 근거 노드가 표시 한도를 초과했다")

    # 얕은 파일 경로도 마지막에는 루트 묶음에 들어가므로 크기 제한은 반드시 종료한다.
    depth = 0
    while True:
        groups = defaultdict(list)
        for identifier, path in sorted(paths.items()):
            parts = PurePosixPath(path).parts
            key = path if depth == 0 else "/".join(parts[: max(0, len(parts) - depth)]) + "/*"
            groups[key].append(identifier)
        if len(groups) <= budget:
            break
        depth += 1

    # 합친 노드의 간선은 묶음 단위이며 같은 파일 버전이라는 주장을 하지 않는다.
    replacements = {}
    for path, members in sorted(groups.items()):
        identifier = f"file-group-{sha256(path.encode()).hexdigest()}"
        retained[identifier] = {
            "id": identifier,
            "kind": "file",
            "label": f"파일 묶음 · {path}",
            "note": f"경로 묶음: {len(members)}개 파일 노드. 서로 다른 버전·해시를 합친 표시이며 "
            "개별 파일의 동일성이나 실행 간 연결을 뜻하지 않는다.",
        }
        replacements.update(dict.fromkeys(members, identifier))
    return retained, replacements
