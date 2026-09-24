"""규칙 테스트에 실제 행사 계약과 로컬 스키마를 제공하고 네트워크를 차단한다."""

import json
import socket
from pathlib import Path
from typing import Any

import pytest
from jsonschema import Draft202012Validator
from referencing import Registry, Resource


# 테스트 중 DNS와 직접 소켓 연결을 모두 거부한다.
@pytest.fixture(autouse=True)
def block_network(monkeypatch: pytest.MonkeyPatch) -> None:
    # 접속 주소를 노출하지 않고 외부 호출 자체를 실패시킨다.
    def deny_connection(*args: object, **kwargs: object) -> None:
        raise AssertionError("규칙 테스트에서는 외부 호출을 허용하지 않습니다.")

    # 라이브러리 내부 접속도 같은 금지 규칙을 적용한다.
    monkeypatch.setattr(socket, "getaddrinfo", deny_connection)
    monkeypatch.setattr(socket, "create_connection", deny_connection)
    monkeypatch.setattr(socket.socket, "connect", deny_connection)
    monkeypatch.setattr(socket.socket, "connect_ex", deny_connection)


# 테스트마다 독립된 영종 불꽃축제 계약 입력을 돌려준다.
@pytest.fixture
def event(contract_fixtures: Path) -> dict[str, Any]:
    return json.loads((contract_fixtures / "event/valid-yeongjong.json").read_text(encoding="utf-8"))


# 개별 조건을 분리해 시험하도록 행사 픽스처에서 위험 요소와 야간 조건을 제거한다.
@pytest.fixture
def daytime_event(event: dict[str, Any]) -> dict[str, Any]:
    return {**event, "type": "기타", "hazards": [], "timeOfDay": "주간"}


# 우천 조건이 꺼진 계약 날씨를 기본값으로 제공한다.
@pytest.fixture
def dry_weather(event: dict[str, Any]) -> dict[str, Any]:
    return {
        "lat": event["venue"]["lat"],
        "lng": event["venue"]["lng"],
        "at": event["startsAt"],
        "sky": "맑음",
        "pty": "없음",
        "temp": 18,
        "pop": 0,
        "source": "단기예보",
        "fetchedAt": "2025-10-17T09:00:00+09:00",
    }


# 기준 그래프의 등록된 규칙·조항·가정을 정본에서 확인한다.
@pytest.fixture
def master_ids(contract_fixtures: Path) -> dict[str, Any]:
    return json.loads((contract_fixtures.parent / "jsonld/master-ids.json").read_text(encoding="utf-8"))


# 가정·수치 하위 스키마도 외부 접속 없이 검사한다.
@pytest.fixture
def common_validator(contract_fixtures: Path) -> Draft202012Validator:
    schema = json.loads((contract_fixtures.parent / "schemas/common.schema.json").read_text(encoding="utf-8"))
    registry = Registry().with_resource(schema["$id"], Resource.from_contents(schema))
    return Draft202012Validator(schema, registry=registry)
