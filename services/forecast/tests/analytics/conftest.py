"""일괄 예보의 입력·조립 결과를 격리하고 외부 통신을 차단한다."""

import json
import socket
from datetime import date
from pathlib import Path
from typing import Any

import pytest
from crowdcast import paths
from crowdcast.analytics import upcoming
from crowdcast.data.events import EVENT_DTYPES


# 배치 테스트가 실제 수집·공유 산출물에 접근하지 않게 전처리 경로와 모델을 고정한다.
@pytest.fixture
def batch_data(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setattr(paths, "PROCESSED", tmp_path)
    pointer = {"modelVersion": "v0.1.0", "verdict": "미검증", "runId": "bt-v0.1.0"}
    monkeypatch.setattr(upcoming, "current_model", lambda: (None, pointer))
    monkeypatch.setattr(upcoming, "promoted", lambda: pointer)
    return tmp_path


# 모든 통신을 막아 녹화 계약 자료만으로 배치를 검증한다.
@pytest.fixture(autouse=True)
def block_network(monkeypatch: pytest.MonkeyPatch) -> None:
    # 직접 소켓과 DNS 모두 테스트 실패로 드러낸다.
    def deny(*args: object, **kwargs: object) -> None:
        raise AssertionError("일괄 예보 테스트는 네트워크를 사용하지 않습니다")

    monkeypatch.setattr(socket, "getaddrinfo", deny)
    monkeypatch.setattr(socket.socket, "connect", deny)


# 실제 국내 행사의 계약 입력을 행사 마스터 형태로 제공한다.
@pytest.fixture
def master_row() -> dict[str, Any]:
    return {
        **dict.fromkeys(EVENT_DTYPES),
        "event_id": "e-jinju-namgang-2026", "name": "진주남강유등축제", "type": "전통",
        "start": date(2026, 10, 3), "end": date(2026, 10, 18), "time_of_day": None,
        "sido": "경상남도", "sigungu_code": "48170", "sigungu_name": "진주시",
        "lat": 35.19, "lng": 128.08, "venue": "진주남강", "fee": "미상", "host_type": "지자체",
        "hazard_flags": [], "source": ["문체부"],
    }


# 조립 자체는 API 통합 테스트에서 검사하고 여기서는 유효한 계약 예보로 배치 흐름을 격리한다.
@pytest.fixture
def recorded_forecast(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    template = paths.REPO_ROOT / "packages/contracts/fixtures/forecast/valid-yeongjong.json"
    calls = []

    # 매 호출 별도 객체를 사용해 이전 행의 요약·OOD 상태가 다음 행에 섞이지 않게 한다.
    def assemble(event: dict[str, Any]) -> dict[str, Any]:
        calls.append(event)
        result = json.loads(template.read_text(encoding="utf-8"))
        result.update(id=event["id"].replace("e-", "f-", 1), eventId=event["id"], ood=True)
        result["predictionRun"]["modelVerdict"] = "미검증"
        return result

    monkeypatch.setattr(upcoming, "assemble_forecast", assemble)
    return calls
