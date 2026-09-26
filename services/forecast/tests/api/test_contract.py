"""예보 계약 픽스처와 중첩 참조의 형식 위반을 검증한다."""

import json
from pathlib import Path
from typing import Any

import pytest
from crowdcast import paths
from crowdcast.api import contract
from crowdcast.api.contract import validate
from jsonschema import ValidationError

FORECAST_FIXTURES = paths.REPO_ROOT / "packages" / "contracts" / "fixtures" / "forecast"


# 계약 정본의 정상·오류 예보를 모두 동일한 공개 검증 함수로 판정한다.
@pytest.mark.parametrize("fixture", sorted(FORECAST_FIXTURES.glob("*.json")), ids=lambda path: path.name)
def test_forecast_fixtures(fixture: Path) -> None:
    forecast = json.loads(fixture.read_text(encoding="utf-8"))
    if fixture.name.startswith("valid-"):
        assert validate("forecast", forecast) is None
    else:
        assert fixture.name.startswith("invalid-")
        with pytest.raises(ValidationError):
            validate("forecast", forecast)


# 형식 테스트마다 원본을 새로 읽어 다른 테스트의 변경이 섞이지 않게 한다.
@pytest.fixture
def forecast(contract_fixtures: Path) -> dict[str, Any]:
    return json.loads((contract_fixtures / "forecast" / "valid-yeongjong.json").read_text(encoding="utf-8"))


# 문자열 타입만 맞아도 잘못된 날짜·시각은 통과하지 않아야 한다.
@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("asOf", "2025-02-29"),
        ("asOf", "2025-10-04T00:00:00+09:00"),
        ("createdAt", "2026-02-30T20:00:00+09:00"),
        ("createdAt", "2026-09-24T20:00:00"),
        ("createdAt", "2026-09-24 20:00:00+09:00"),
        ("createdAt", "2026-09-24T24:00:00+09:00"),
        ("createdAt", "2026-09-24T20:00:00+09:60"),
        ("createdAt", "2026-09-24T20:00:00+24:00"),
    ],
)
def test_rejects_invalid_dates(forecast: dict[str, Any], field: str, value: str) -> None:
    forecast[field] = value
    with pytest.raises(ValidationError) as error:
        validate("forecast", forecast)
    assert error.value.validator == "format"
    assert list(error.value.absolute_path) == [field]


# UTC와 소수 초 등 계약이 허용한 RFC 3339 표기도 받아들인다.
@pytest.mark.parametrize("value", ["2026-09-24T11:00:00Z", "2026-09-24t20:00:00.123+09:00"])
def test_accepts_valid_datetimes(forecast: dict[str, Any], value: str) -> None:
    forecast["createdAt"] = value
    validate("forecast", forecast)


# 여러 파일의 $ref를 거쳐 들어간 출처 URI도 형식 검사를 적용한다.
@pytest.mark.parametrize(
    "value",
    [
        "data/15101972/openapi.do",
        "https://www.data.go.kr/잘못된 공백",
        "https://www.data.go.kr/%GG",
        "https://www.data.go.kr:port/",
        "https://[not-an-ip]/",
        "https://[1:2:3]/",
        "https://[fe80::1%25eth0]/",
    ],
)
def test_rejects_invalid_source_uri(forecast: dict[str, Any], value: str) -> None:
    forecast["evidence"][0]["source"]["accessUrl"] = value
    with pytest.raises(ValidationError) as error:
        validate("forecast", forecast)
    assert any(
        detail.validator == "format" and list(detail.absolute_path) == ["evidence", 0, "source", "accessUrl"]
        for detail in error.value.context
    )


# 출처 없음과 HTTP 이외의 절대 URI도 계약대로 받아들인다.
@pytest.mark.parametrize(
    "value",
    [
        None,
        "urn:dataset:kto-visitors",
        "https://[::1]:8010/data",
        "https://www.data.go.kr/%ED%95%9C?q=1#data",
    ],
)
def test_accepts_source_uri(forecast: dict[str, Any], value: str | None) -> None:
    forecast["evidence"][0]["source"]["accessUrl"] = value
    validate("forecast", forecast)


# 실행 위치가 바뀌어도 기존 경로 모듈을 통해 계약을 찾는다.
def test_contract_is_independent_of_cwd(
    forecast: dict[str, Any], monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    contract._validators.cache_clear()
    monkeypatch.chdir(tmp_path)
    validate("forecast", forecast)


# 계약 이름 오타를 검증 성공으로 취급하지 않는다.
def test_unknown_schema_is_rejected() -> None:
    with pytest.raises(ValueError, match="알 수 없는 계약 스키마"):
        validate("unregistered-schema", {})
