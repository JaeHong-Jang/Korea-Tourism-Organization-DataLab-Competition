"""기상청 ASOS 시간자료로 과거 실버 행사 기간의 시군구 일강수량(weather_daily)을 만든다."""

import argparse
import csv
import io
import math
from datetime import date, datetime, timedelta
from pathlib import Path

import polars as pl

from crowdcast import paths
from crowdcast.data.call_ledger import CallLimitReached, atomic_write, korea_today
from crowdcast.data.datago_client import DataGoClient, DataGoError

# 지점번호를 모르므로 ASOS 번호대를 한 시간 자료로 한 번씩 조회해 실제 지점명을 받는다.
STATION_RANGE = range(90, 300)
PROBE_DAY = date(2024, 6, 1)
# 한 번 호출(999행)에 담기는 시간자료 일수와 행사 시군구에서 관측소까지 허용 거리.
WINDOW_DAYS = 41
MAX_DISTANCE_KM = 40.0
# 광역시 지점명은 경기 광주시 같은 동명 시군구보다 먼저 해당 시의 구 중심으로 읽는다.
METRO = {"서울": "서울특별시", "부산": "부산광역시", "대구": "대구광역시", "인천": "인천광역시",
         "광주": "광주광역시", "대전": "대전광역시", "울산": "울산광역시"}
# 시군구 이름이 아닌 지점명의 소재 시군구.
STATION_PLACES = {"북강릉": "강릉", "북춘천": "춘천", "북창원": "창원", "북부산": "부산", "대관령": "평창",
                  "추풍령": "영동", "백령도": "옹진", "흑산도": "신안", "울릉도": "울릉", "고산": "제주",
                  "성산": "서귀포", "서청주": "청주"}


# 시간자료 한 페이지 요청 인자를 만든다(KMA 일강수량과 같게 01시~다음날 00시).
def hourly_params(station: int, first: date, last: date) -> dict[str, str | int]:
    return {"dataType": "JSON", "dataCd": "ASOS", "dateCd": "HR", "stnIds": station,
            "startDt": first.strftime("%Y%m%d"), "startHh": "01",
            "endDt": (last + timedelta(days=1)).strftime("%Y%m%d"), "endHh": "00"}


# 오류가 난 번호도 다시 조회하지 않도록 발견한 지점 목록을 캐시에 남긴다.
def discover_stations(client: DataGoClient, cache: Path) -> dict[int, str]:
    if cache.exists():
        with cache.open(encoding="utf-8", newline="") as stream:
            return {int(row["stn_id"]): row["stn_name"] for row in csv.DictReader(stream)}
    stations: dict[int, str] = {}
    for station in STATION_RANGE:
        params = {**hourly_params(station, PROBE_DAY, PROBE_DAY), "endDt": PROBE_DAY.strftime("%Y%m%d"),
                  "endHh": "01"}
        try:
            page = client.page("asos", params, num_rows=1)
        except DataGoError:
            continue
        if page.items:
            stations[station] = str(page.items[0]["stnNm"]).strip()
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(["stn_id", "stn_name"])
    writer.writerows(sorted(stations.items()))
    atomic_write(cache, output.getvalue().encode())
    return stations


# 지점명을 행정구역 중심 좌표로 바꾸고 찾지 못하거나 두 곳 이상이면 제외 목록에 남긴다.
def station_places(
    stations: dict[int, str], admin: pl.DataFrame,
) -> tuple[dict[int, tuple[float, float]], list[str]]:
    places: dict[int, tuple[float, float]] = {}
    skipped: list[str] = []
    top = admin.filter(pl.col("parent_code").is_null())
    for station, name in stations.items():
        stem = STATION_PLACES.get(name, name)
        if stem in METRO:
            rows = top.filter((pl.col("sido") == METRO[stem]) & pl.col("sigungu_name").str.ends_with("구"))
        else:
            rows = top.filter(pl.col("aliases").list.eval(pl.element().is_in([stem, name])).list.any())
        if rows.height == 0 or (stem not in METRO and rows.height > 1):
            skipped.append(f"{station} {name}")
            continue
        places[station] = (rows["lat"].mean(), rows["lng"].mean())
    return places, skipped


# 두 위경도 사이의 대원 거리(km).
def distance_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lng1, lat2, lng2 = map(math.radians, (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


# 학습 가능한 대표 실버 라벨이 있는 1~14일 과거 행사만 강수 확인 대상으로 고른다.
def target_events(events: pl.DataFrame, labels: pl.DataFrame, *, before: date) -> pl.DataFrame:
    usable = labels.filter((pl.col("label_tier") == "silver") & pl.col("is_primary")
                           & pl.col("usable_for_training")).select("event_id").unique()
    return events.join(usable, on="event_id").filter(
        pl.col("start").is_not_null() & pl.col("end").is_not_null() & (pl.col("end") < before)
        & ((pl.col("end") - pl.col("start")).dt.total_days() + 1).is_between(1, 14)
    ).select("event_id", "sigungu_code", "start", "end")


# 같은 관측소의 행사를 한 번 호출 창(41일)으로 묶어 호출 수를 줄인다.
def windows(spans: list[tuple[date, date]]) -> list[tuple[date, date]]:
    merged: list[tuple[date, date]] = []
    for first, last in sorted(spans):
        if merged and (max(merged[-1][1], last) - merged[-1][0]).days + 1 <= WINDOW_DAYS:
            merged[-1] = (merged[-1][0], max(merged[-1][1], last))
        else:
            merged.append((first, last))
    return merged


# 시간 강수를 한 시간 앞당겨 날짜별로 합하고 24시간이 모두 있는 날만 남긴다(빈 값은 무강수).
# 빈 값의 결측 표시(9)는 비 온 시각 사이·습도 40% 안팎 시각에도 붙어 측정 실패가 아니라 무강수로 센다.
def daily_totals(items: list[dict]) -> dict[date, float]:
    totals: dict[date, float] = {}
    hours: dict[date, int] = {}
    for item in items:
        day = (datetime.strptime(item["tm"], "%Y-%m-%d %H:%M") - timedelta(hours=1)).date()
        value = str(item.get("rn") or "").strip()
        totals[day] = totals.get(day, 0.0) + (float(value) if value else 0.0)
        hours[day] = hours.get(day, 0) + 1
    return {day: round(total, 1) for day, total in totals.items() if hours[day] == 24}


# 행사 시군구마다 가장 가까운 관측소의 일강수량을 행사 날짜에 붙여 저장 형식으로 만든다.
def collect(client: DataGoClient, events: pl.DataFrame, admin: pl.DataFrame,
            stations: dict[int, str]) -> tuple[pl.DataFrame, dict[str, object]]:
    places, skipped = station_places(stations, admin)
    centers = {row["sigungu_code"]: (row["lat"], row["lng"]) for row in admin.to_dicts()}
    assigned: dict[int, list[dict]] = {}
    far = 0
    for event in events.to_dicts():
        center = centers.get(event["sigungu_code"])
        nearest = min(places, key=lambda s: distance_km(center, places[s])) if center and places else None
        if nearest is None or distance_km(center, places[nearest]) > MAX_DISTANCE_KM:
            far += 1
            continue
        assigned.setdefault(nearest, []).append(event)
    rows: dict[tuple[str, date], dict] = {}
    calls = 0
    for station, group in sorted(assigned.items()):
        for first, last in windows([(event["start"], event["end"]) for event in group]):
            items = [item for page in client.pages("asos", hourly_params(station, first, last), num_rows=999)
                     for item in page.items]
            calls += 1
            totals = daily_totals(items)
            for event in group:
                if not first <= event["start"] <= last:
                    continue
                for offset in range((event["end"] - event["start"]).days + 1):
                    day = event["start"] + timedelta(days=offset)
                    if day in totals:
                        rows[event["sigungu_code"], day] = {
                            "sigungu_code": event["sigungu_code"], "date": day,
                            "precipitation_mm": totals[day], "station_id": station,
                            "station_name": stations[station],
                        }
    frame = pl.DataFrame(list(rows.values()), schema={
        "sigungu_code": pl.String, "date": pl.Date, "precipitation_mm": pl.Float64,
        "station_id": pl.Int64, "station_name": pl.String,
    }).sort("sigungu_code", "date")
    report = {"관측소": len(stations), "좌표 확인 관측소": len(places), "제외 관측소": skipped,
              "대상 행사": events.height, "40km 밖 행사": far, "조회 창": calls, "일강수 행": frame.height}
    return frame, report


# 대상 행사만 조회해 processed/weather_daily.parquet를 원자적으로 교체한다.
def main() -> int:
    parser = argparse.ArgumentParser(description="ASOS 시간자료로 과거 실버 행사의 일강수량을 모은다")
    parser.add_argument("command", choices=["collect"])
    parser.add_argument("--processed", type=Path, default=paths.PROCESSED)
    parser.add_argument("--max-calls", type=int, default=700)
    args = parser.parse_args()
    events = target_events(pl.read_parquet(args.processed / "events.parquet"),
                           pl.read_parquet(args.processed / "labels.parquet"),
                           before=korea_today() - timedelta(days=1))
    admin = pl.read_parquet(args.processed / "admin_dict.parquet", columns=[
        "sigungu_code", "sigungu_name", "sido", "parent_code", "aliases", "lat", "lng"])
    try:
        with DataGoClient(max_calls=args.max_calls) as client:
            stations = discover_stations(client, paths.CACHE / "datago/asos_stations.csv")
            frame, report = collect(client, events, admin, stations)
    except (CallLimitReached, DataGoError) as error:
        parser.exit(1, f"ASOS 수집 중단: {error}\n")
    buffer = io.BytesIO()
    frame.write_parquet(buffer)
    atomic_write(args.processed / "weather_daily.parquet", buffer.getvalue())
    for name, value in report.items():
        print(f"{name}: {value}")
    return 0


# 모듈 실행은 수집·저장만 하며 계수 추정은 models.weather_adjust fit이 맡는다.
if __name__ == "__main__":
    raise SystemExit(main())
