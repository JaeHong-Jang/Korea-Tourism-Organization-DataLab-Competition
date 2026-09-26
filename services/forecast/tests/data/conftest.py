"""네트워크를 차단하고 실제 연도별 머리글 구조를 닮은 작은 xlsx를 만든다."""

import json
import socket
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any

import httpx
import pytest
from crowdcast import config
from crowdcast.data.datago_client import DataGoClient
from openpyxl import Workbook


# 합성 파일 검증 중 외부 서비스에 접속하면 즉시 실패시킨다.
@pytest.fixture(autouse=True)
def no_network(monkeypatch: pytest.MonkeyPatch) -> None:
    # 네트워크 허용 여부와 무관하게 테스트가 로컬 입력만 쓰게 한다.
    def reject(*args: object, **kwargs: object) -> None:
        raise AssertionError("T-100 테스트의 네트워크 호출 금지")

    monkeypatch.setattr(socket.socket, "connect", reject)
    monkeypatch.setattr(socket, "create_connection", reject)


# 행·병합 범위를 주면 제목과 빈 총괄 시트를 가진 임시 원본을 만든다.
@pytest.fixture
def xlsx(tmp_path: Path) -> Callable:
    # 테스트마다 다른 머리글 위치·병합 구조를 실제 xlsx로 직렬화한다.
    def write(rows: list[list[object]], merges: tuple[str, ...] = (), sheet_name: str = "서울") -> Path:
        workbook = Workbook()
        workbook.active.title = "총괄"
        workbook.active.append(["지역별 축제 합계", 2])
        sheet = workbook.create_sheet(sheet_name)
        for row in rows:
            sheet.append(row)
        for area in merges:
            sheet.merge_cells(area)
        path = tmp_path / "지역축제 개최계획.xlsx"
        workbook.save(path)
        workbook.close()
        return path

    return write


# 승인된 7일 실호출 응답 여섯 페이지를 키·요청 URL 없이 재생한다.
@pytest.fixture
def datago_recordings() -> list[dict[str, Any]]:
    folder = Path(__file__).parent / "fixtures" / "datago"
    return [json.loads(path.read_bytes()) for path in sorted(folder.glob("visitors_*.json"))]


# 실제 .env를 건드리지 않고 각 테스트의 캐시·장부·인증키·전송을 격리한다.
@pytest.fixture
def datago_factory(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    datago_recordings: list[dict[str, Any]],
) -> Iterator[Callable[..., DataGoClient]]:
    env_file = tmp_path / ".env"
    env_file.write_text("DATA_GO_KR_KEY=fixture-only-token+/=\n", encoding="utf-8")
    monkeypatch.setattr(config, "ENV_FILE", env_file)
    config.get_settings.cache_clear()
    clients = []

    # 페이지 번호는 녹화된 실제 응답의 번호와 일치해야 한다.
    def recorded_response(request: httpx.Request) -> httpx.Response:
        number = int(request.url.params["pageNo"])
        return httpx.Response(200, json=datago_recordings[number - 1]["payload"])

    # 여러 클라이언트를 생성하면 같은 임시 장부와 페이지 캐시를 공유한다.
    def create(
        *,
        max_calls: int = 800,
        respond: Callable[[httpx.Request], httpx.Response] | None = None,
        cache_dir: Path | None = None,
    ) -> DataGoClient:
        client = DataGoClient(
            cache_dir=cache_dir or tmp_path / "datago",
            max_calls=max_calls,
            transport=httpx.MockTransport(respond or recorded_response),
        )
        clients.append(client)
        return client

    yield create
    for client in clients:
        client.__exit__()
    config.get_settings.cache_clear()
