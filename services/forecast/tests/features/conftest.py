"""피처 검사 산출물을 테스트 임시 폴더로 격리한다."""

from pathlib import Path

import pytest
from crowdcast import paths


# 합성 검사가 실제 파이프라인의 마지막 피처 게이트 결과를 덮어쓰지 않게 한다.
@pytest.fixture(autouse=True)
def isolate_availability_audit(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(paths, "PROCESSED", tmp_path)
