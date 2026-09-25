"""Dagster 자산 테스트에 격리된 단계·클라이언트와 실제 기록 저장소를 제공한다."""

from pathlib import Path

import pytest
from crowdcast.pipeline import gates, stages
from dagster_fixtures import FakeStages, FakeVisitorClient


# 모든 테스트는 기존 격리 경로와 전송 차단 픽스처 위에서 가짜 단계만 실행한다.
@pytest.fixture
def fake_stages(pipeline_root: Path, monkeypatch: pytest.MonkeyPatch) -> FakeStages:
    fake = FakeStages()
    monkeypatch.setattr(stages, "execute_stage", fake.execute)
    monkeypatch.setattr(stages, "VisitorClient", FakeVisitorClient)
    monkeypatch.setattr(stages, "missing_entrypoint", lambda name: None)
    monkeypatch.setattr(gates, "promoted_result", lambda: ({"기준": "실행 시작 때 사용 모델"}, None))
    return fake
