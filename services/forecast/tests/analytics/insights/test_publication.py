"""저장 전 계약 검증·원자 교체·읽기 전용 라우트와 배치 후 계산 연결을 검사한다."""

import asyncio
import json
from pathlib import Path
from subprocess import CompletedProcess

import pytest
from crowdcast import paths
from crowdcast.analytics.insights import storage
from crowdcast.analytics.insights.__main__ import calculate
from crowdcast.analytics.insights.records import Inputs
from crowdcast.api.routes import insights
from crowdcast.pipeline import stages
from fastapi import HTTPException
from jsonschema import ValidationError


# 발행한 일곱 파일이 계약을 통과하고 라우트는 입력 원본 없이 저장 결과만 읽는다.
def test_seven_outputs_and_routes() -> None:
    outputs = calculate(Inputs("2026-09-25T12:00:00+09:00"), {})
    files = storage.publish(outputs)
    assert len(files) == 7
    for key, expected in outputs.items():
        assert storage.read(key) == expected
        route = insights.datalab_spec() if key == "datalab-spec" else insights.insight(key)
        response = asyncio.run(route)
        assert response.status_code == 200
        assert json.loads(response.body) == expected
    assert sorted(path.name for path in (paths.PROCESSED / "insights").iterdir()) == sorted(
        path.name for path in files
    )


# 파일 부재와 잘못된 키는 계산을 시도하지 않고 사유를 포함한 404다.
@pytest.mark.parametrize("key", ["I1", "I7", "../events", "datalab-spec"])
def test_missing_saved_result(key: str) -> None:
    with pytest.raises(HTTPException) as raised:
        insights.stored(key)
    assert raised.value.status_code == 404
    assert raised.value.detail


# 마지막 파일의 검증 실패도 기존 여섯 지표에 부분 반영되지 않는다.
def test_validate_before_any_replacement() -> None:
    outputs = calculate(Inputs("2026-09-25T12:00:00+09:00"), {})
    files = storage.publish(outputs)
    before = {path: path.read_bytes() for path in files}
    outputs["I1"]["headline"]["text"] = "변경 예정"
    outputs["datalab-spec"]["unexpected"] = True
    with pytest.raises(ValidationError):
        storage.publish(outputs)
    assert all(path.read_bytes() == content for path, content in before.items())


# 파일 교체 도중 실패하면 이미 교체한 지표도 직전 발행본으로 되돌린다.
def test_rollback_on_replace_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    outputs = calculate(Inputs("2026-09-25T12:00:00+09:00"), {})
    files = storage.publish(outputs)
    before = {path: path.read_bytes() for path in files}
    outputs["I1"]["headline"]["text"] = "변경 예정"
    replace = storage.os.replace

    # 세 번째 새 JSON 교체만 실패시키고 복구용 교체는 허용한다.
    def fail_third(source: Path, target: Path) -> None:
        if source.name == "I3.json":
            raise OSError("합성 디스크 교체 실패")
        replace(source, target)

    monkeypatch.setattr(storage.os, "replace", fail_third)
    with pytest.raises(OSError, match="합성 디스크"):
        storage.publish(outputs)
    assert all(path.read_bytes() == content for path, content in before.items())


# 일괄 예보가 실패하면 계산하지 않고 인사이트 실패는 배치의 종료 코드로 전달한다.
@pytest.mark.parametrize("batch_code,insight_code,expected", [(1, 0, 1), (0, 2, 2), (0, 0, 0)])
def test_pipeline_batch_followup(
    monkeypatch: pytest.MonkeyPatch, batch_code: int, insight_code: int, expected: int
) -> None:
    calls = []

    # 실제 프로세스 대신 모듈 호출 순서와 종료 코드 전파만 관찰한다.
    def run(command: list[str], **kwargs: object) -> CompletedProcess:
        module = command[2]
        calls.append(module)
        code = batch_code if module == "crowdcast.analytics.upcoming" else insight_code
        return CompletedProcess(command, code, "합성 실행", "")

    monkeypatch.setattr(stages.subprocess, "run", run)
    assert stages.command("crowdcast.analytics.upcoming")[0] == expected
    assert calls == (
        ["crowdcast.analytics.upcoming"]
        if batch_code
        else ["crowdcast.analytics.upcoming", "crowdcast.analytics.insights"]
    )
