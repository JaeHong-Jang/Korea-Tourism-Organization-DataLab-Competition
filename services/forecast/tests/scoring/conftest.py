"""사전 등록 테스트의 파일 쓰기를 임시 경로에 격리하고 실제 네트워크를 차단한다."""

import socket
from pathlib import Path

import pytest
from crowdcast import paths


# 실제 공유 데이터·공개 폴더가 테스트 산출물로 바뀌지 않도록 경로를 고정한다.
@pytest.fixture(autouse=True)
def isolate(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(paths, "PROCESSED", tmp_path / "processed")
    monkeypatch.setattr(paths, "REPORTS", tmp_path / "reports")
    monkeypatch.setattr(paths, "MODELS", tmp_path / "models")

    # MockTransport만 허용하고 DNS·실제 연결은 즉시 테스트를 실패시킨다.
    def deny(*args: object, **kwargs: object) -> None:
        raise AssertionError("사전 등록 테스트는 실제 네트워크를 사용하지 않습니다")

    monkeypatch.setattr(socket, "getaddrinfo", deny)
    monkeypatch.setattr(socket.socket, "connect", deny)
