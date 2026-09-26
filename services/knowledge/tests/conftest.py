"""근거 그래프 서비스 테스트 공용 설정 — 픽스처 경로와 네트워크 차단 기본값."""
from pathlib import Path

import pytest
from knowledge import paths

# 계약 픽스처와 서비스별 녹화 픽스처 위치
REPO_ROOT = Path(__file__).resolve().parents[3]
CONTRACT_FIXTURES = REPO_ROOT / "packages" / "contracts" / "fixtures"
SERVICE_FIXTURES = Path(__file__).parent / "fixtures"


# 기동 적재와 검증 기록이 개발자의 실제 모델·공유 저장소를 바꾸지 않게 한다.
@pytest.fixture(autouse=True)
def isolated_runtime(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(paths, "DATA_ROOT", tmp_path)
    monkeypatch.setattr(paths, "STORE", tmp_path / "data/app/knowledge")


@pytest.fixture
def contract_fixtures() -> Path:
    # 계약 픽스처 폴더를 테스트에 넘긴다
    return CONTRACT_FIXTURES


@pytest.fixture
def service_fixtures() -> Path:
    # 이 서비스의 녹화 응답 픽스처 폴더를 테스트에 넘긴다
    return SERVICE_FIXTURES
