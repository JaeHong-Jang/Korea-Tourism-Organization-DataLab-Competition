"""요청 시각에 맞는 실황·단기·중기 자료를 골라 장애에도 계약에 맞는 날씨를 반환한다."""

from collections.abc import Callable
from contextlib import ExitStack
from datetime import datetime, timedelta
from typing import Any

from crowdcast.data.call_ledger import KST, CallLimitReached
from crowdcast.data.datago_client import DataGoError
from crowdcast.data.weather.client import WeatherClient
from crowdcast.data.weather.grid import to_grid
from crowdcast.data.weather.normalize import as_kst
from crowdcast.data.weather.regions import weather_regions
from crowdcast.data.weather.stale_cache import cached_results


# 테스트와 실제 요청에서 같은 한국 현재시각 경계를 사용한다.
def now() -> datetime:
    return datetime.now(KST)


# 발표 지연을 반영하며 자정 직후에는 전날 마지막 회차를 선택한다.
def latest_base(current: datetime, hours: tuple[int, ...], delay: int = 0) -> datetime:
    available = current - timedelta(minutes=delay)
    midnight = available.replace(hour=0, minute=0, second=0, microsecond=0)
    return max(
        stamp
        for day in (0, 1)
        for hour in hours
        if (stamp := midnight - timedelta(days=day) + timedelta(hours=hour)) <= available
    )


# 일·반일 예보는 해당 구간만 사용하고 단기는 요청에 가장 가까운 예보 시각을 고른다.
def select_record(snapshot: dict[str, Any], at: datetime) -> dict[str, Any] | None:
    records = snapshot["records"]
    if snapshot["product"].startswith("mid_"):
        records = [row for row in records if as_kst(row["valid_at"]) <= at < as_kst(row["valid_until"])]
    if not records:
        return None
    return min(records, key=lambda row: (abs(as_kst(row["valid_at"]) - at), row["valid_at"]))


# 한도·통신·키 부재·캐시 손상은 같은 위치의 이전 성공 자료로 대체한다.
def fetch_record(
    client: WeatherClient,
    api: str,
    location: dict[str, Any],
    base: datetime,
    at: datetime,
    fetch: Callable[[], dict[str, Any]],
) -> tuple[dict[str, Any], str] | None:
    try:
        snapshot = fetch()
        record = select_record(snapshot, at)
        if record is not None:
            return record, snapshot["fetched_at"]
    except (DataGoError, CallLimitReached, OSError):
        pass
    for snapshot in cached_results(client.cache_dir, api, location, base):
        record = select_record(snapshot, at)
        if record is not None:
            return record, snapshot["fetched_at"]
    return None


# 관측 세부 강수 코드는 계약의 상위 강수형태로 합치되 결측을 무강수로 바꾸지 않는다.
def weather_values(record: dict[str, Any]) -> dict[str, Any]:
    pty = record["precipitation_type"]
    pop = record["precipitation_probability_pct"]
    return {
        "sky": record["sky"],
        "pty": {"빗방울": "비", "빗방울눈날림": "비/눈", "눈날림": "눈"}.get(pty, pty),
        "temp": record["temperature_c"],
        "tempMin": record.get("temperature_min_c"),
        "tempMax": record.get("temperature_max_c"),
        "pop": int(pop) if pop is not None and float(pop).is_integer() else None,
    }


# 중기는 광역 날씨와 해당 도시 기온을 각각 조회하며 시간별 기온을 임의 생성하지 않는다.
def mid_weather(
    client: WeatherClient, lat: float, lng: float, at: datetime, current: datetime
) -> tuple[dict[str, Any], str] | None:
    regions = weather_regions(lat, lng)
    if regions is None:
        return None
    base = latest_base(current, (6, 18))
    land, city = regions
    sky = fetch_record(client, "mid_land", {"regId": land}, base, at, lambda: client.mid_term(land, base))
    temperature = None
    if city is not None:
        temperature = fetch_record(
            client, "mid_temperature", {"regId": city}, base, at, lambda: client.mid_term(city, base)
        )
    # 시각 기온(temp)은 만들지 않고 그날 최저·최고만 계약의 tempMin·tempMax로 붙인다.
    if sky is None or temperature is None:
        return sky
    record, fetched = sky
    daily = temperature[0]
    return {
        **record,
        "temperature_min_c": daily.get("temperature_min_c"),
        "temperature_max_c": daily.get("temperature_max_c"),
    }, fetched


# 과거·열흘 초과 요청은 호출하지 않으며 미제공 측정값은 모두 null로 유지한다.
def weather(
    lat: float, lng: float, at: datetime | str, *, client: WeatherClient | None = None
) -> dict[str, Any]:
    target, current = as_kst(at), as_kst(now())
    result = {
        "lat": lat,
        "lng": lng,
        "at": target.isoformat(),
        "sky": None,
        "pty": None,
        "temp": None,
        "tempMin": None,
        "tempMax": None,
        "pop": None,
        "source": "없음",
        "fetchedAt": None,
    }
    delta = target - current
    if delta < -timedelta(hours=1) or delta > timedelta(days=10):
        return result
    try:
        nx, ny = to_grid(lat, lng)
    except ValueError:
        return result

    # gateway의 5초 예산 안에 오프라인 대체가 시작되도록 재시도와 페이지 호출을 제한한다.
    with ExitStack() as stack:
        connection = (
            client
            if client is not None
            else stack.enter_context(WeatherClient(timeout_seconds=1, attempts=1, max_calls=3))
        )
        if delta <= timedelta(hours=1):
            source = "초단기실황"
            selected = fetch_record(
                connection,
                "ultra_now",
                {"nx": nx, "ny": ny},
                current,
                target,
                lambda: connection.ultra_now(nx, ny, current),
            )
        elif delta <= timedelta(days=3):
            source = "단기예보"
            base = latest_base(current, (2, 5, 8, 11, 14, 17, 20, 23), delay=10)
            selected = fetch_record(
                connection,
                "short_term",
                {"nx": nx, "ny": ny},
                base,
                target,
                lambda: connection.short_term(nx, ny, base),
            )
        else:
            source = "중기예보"
            selected = mid_weather(connection, lat, lng, target, current)

    # 모두 결측인 레코드는 성공한 날씨로 표시하지 않는다.
    if selected is not None:
        record, fetched = selected
        values = weather_values(record)
        if any(value is not None for value in values.values()):
            result.update(values, source=source, fetchedAt=fetched)
    return result
