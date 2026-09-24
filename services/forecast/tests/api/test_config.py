"""서비스 설정 우선순위와 API 키의 출력 방지를 확인한다."""

from collections.abc import Iterator
from pathlib import Path
from secrets import token_urlsafe

import pytest
from crowdcast import config
from pydantic import ValidationError


# 실제 .env 대신 임시 파일을 사용하고 설정 캐시를 테스트마다 비운다.
@pytest.fixture
def env_file(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Iterator[Path]:
    path = tmp_path / ".env"
    monkeypatch.setattr(config, "ENV_FILE", path)
    for name in ("FORECAST_HOST", "FORECAST_PORT", "DATA_GO_KR_KEY"):
        monkeypatch.delenv(name, raising=False)
    config.get_settings.cache_clear()
    yield path
    config.get_settings.cache_clear()


# 키와 .env가 없는 상태에서도 dev.mjs에 맞는 기본 설정으로 뜬다.
def test_defaults_without_env_file(env_file: Path) -> None:
    settings = config.get_settings()
    assert settings.host == "127.0.0.1"
    assert settings.port == 8010
    assert settings.version == "0.1.0"
    assert settings.data_go_kr_key is None


# .env의 키는 사용할 수 있지만 설정 출력이나 로그에는 나오지 않는다.
def test_dotenv_and_secret_redaction(env_file: Path, caplog: pytest.LogCaptureFixture) -> None:
    secret = token_urlsafe(24)
    env_file.write_text(
        f"FORECAST_HOST=0.0.0.0\nFORECAST_PORT=8011\nDATA_GO_KR_KEY={secret}\n", encoding="utf-8"
    )
    settings = config.get_settings()
    assert settings.host == "0.0.0.0"
    assert settings.port == 8011
    assert settings.data_go_kr_key is not None
    assert settings.data_go_kr_key.get_secret_value() == secret
    assert secret not in repr(settings)
    assert secret not in str(settings)
    assert secret not in settings.model_dump_json()
    assert "data_go_kr_key" not in settings.model_dump()
    assert secret not in caplog.text


# 포트와 호스트는 셸 설정을 우선하되 키는 .env의 값만 쓴다.
def test_environment_precedence(env_file: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    env_file.write_text("FORECAST_HOST=0.0.0.0\nFORECAST_PORT=8011\nDATA_GO_KR_KEY=\n", encoding="utf-8")
    monkeypatch.setenv("FORECAST_HOST", "127.0.0.1")
    monkeypatch.setenv("FORECAST_PORT", "8012")
    monkeypatch.setenv("DATA_GO_KR_KEY", token_urlsafe(24))
    settings = config.get_settings()
    assert settings.host == "127.0.0.1"
    assert settings.port == 8012
    assert settings.data_go_kr_key is None


# 잘못된 포트는 조용히 기본값으로 바꾸지 않고 설정 오류로 알린다.
@pytest.mark.parametrize("port", ["", "invalid", "0", "65536"])
def test_invalid_port_is_rejected(env_file: Path, port: str) -> None:
    secret = token_urlsafe(24)
    env_file.write_text(f"FORECAST_PORT={port}\nDATA_GO_KR_KEY={secret}\n", encoding="utf-8")
    with pytest.raises(ValidationError) as error:
        config.get_settings()
    assert secret not in str(error.value)
    assert "input_value" not in str(error.value)
