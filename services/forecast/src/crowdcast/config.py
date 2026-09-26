"""예측 서비스 설정과 노출하지 않을 API 키를 기존 .env에서 읽는다."""

import os
from functools import lru_cache
from importlib.metadata import version

from dotenv import dotenv_values
from pydantic import BaseModel, ConfigDict, Field, SecretStr

from crowdcast import paths

ENV_FILE = paths.REPO_ROOT / ".env"


# 서비스 설정은 고정하고 비밀은 출력과 직렬화에서 제외한다.
class Settings(BaseModel):
    model_config = ConfigDict(frozen=True, hide_input_in_errors=True)

    service_name: str = "인파예보 예측 서비스"
    version: str = version("crowdcast-forecast")
    host: str = "127.0.0.1"
    port: int = Field(default=8010, ge=1, le=65535)
    data_go_kr_key: SecretStr | None = Field(default=None, repr=False, exclude=True)


# 일반 설정은 환경 변수를 우선하고 API 키는 .env에서만 가져온다.
@lru_cache(maxsize=1)
def get_settings() -> Settings:
    env_file = dotenv_values(ENV_FILE, interpolate=False)
    service_env = {**env_file, **os.environ}
    return Settings.model_validate(
        {
            "host": service_env.get("FORECAST_HOST") or "127.0.0.1",
            "port": service_env.get("FORECAST_PORT", "8010"),
            "data_go_kr_key": env_file.get("DATA_GO_KR_KEY") or None,
        }
    )
