"""API 테스트에서 실제 네트워크 접속을 차단한다."""

import socket

import pytest


# 계약의 $ref와 health가 외부 연결 없이 동작하는지 보장한다.
@pytest.fixture(autouse=True)
def block_network(monkeypatch: pytest.MonkeyPatch) -> None:
    # 예상하지 못한 접속은 대상 주소를 출력하지 않고 실패시킨다.
    def deny_connection(*args: object, **kwargs: object) -> None:
        raise AssertionError("API 테스트에서는 실제 네트워크 접속을 허용하지 않습니다.")

    # DNS 조회와 직접 소켓 접속도 함께 막는다.
    monkeypatch.setattr(socket, "getaddrinfo", deny_connection)
    monkeypatch.setattr(socket, "create_connection", deny_connection)
    monkeypatch.setattr(socket.socket, "connect", deny_connection)
    monkeypatch.setattr(socket.socket, "connect_ex", deny_connection)
