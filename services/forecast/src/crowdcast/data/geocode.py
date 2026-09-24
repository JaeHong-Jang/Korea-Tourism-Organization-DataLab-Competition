"""행정명·원본의 장소 대응·검증된 TourAPI 좌표로 모호성을 보존한 지명 후보를 반환한다."""

import re
from collections import defaultdict
from functools import lru_cache

import polars as pl

from crowdcast import paths
from crowdcast.data.admin_dict import compact, lookup_admin, normalize_sido, resolve_admin, spatial_connection

# 여러 도시에 흔한 시설명만으로 행정구역을 추론하지 않는다.
GENERIC_VENUES = {
    "문화예술회관",
    "종합운동장",
    "공설운동장",
    "시민회관",
    "중앙공원",
    "시민공원",
    "문화회관",
    "시민운동장",
    "실내체육관",
    "청소년수련관",
    "문화예술회관대공연장",
    "운동장",
    "체육관",
    "축제장",
    "시청광장",
    "문화광장",
    "야외무대",
    "주차장",
}


# 같은 장소의 띄어쓰기와 끝의 범위 표현만 통일하고 지명 자체는 보존한다.
def venue_key(value: str | None) -> str:
    return re.sub(r"(?:(?:일원|일대|주변|등))+$", "", compact(value))


# 행정 사전과 근거가 있는 장소 인덱스를 한 실행에서 재사용한다.
class Gazetteer:
    # 장소 대응은 명시 시군구가 있는 원본에서만 만들고 서로 다른 코드도 모두 보존한다.
    def __init__(self, admin: pl.DataFrame, festivals: pl.DataFrame | None = None) -> None:
        self.admin = admin
        self.regions = {row["sigungu_code"]: row for row in admin.to_dicts()}
        self.venues: dict[tuple[str, str], set[str]] = defaultdict(set)
        self._resolved: dict[tuple[str | None, str | None], tuple[dict | None, str]] = {}
        if festivals is not None:
            for row in festivals.select("sido", "sigungu_name", "venue").unique().to_dicts():
                region, _ = self.resolve(row["sigungu_name"], row["sido"])
                raw = row["venue"] or ""
                explicit = lookup_admin(raw, row["sido"], admin)
                if not region and len(explicit) == 1:
                    region = explicit[0]
                # 복수 행정구역이 적힌 장소는 한 지역의 학습 근거로 사용하지 않는다.
                if not region or len(explicit) > 1:
                    continue
                parts = [raw, *re.split(r"[,/;()]|\s+및\s+|\s+등\s+", raw)]
                parts += re.findall(r"(?<![가-힣])([가-힣0-9]{2,}(?:읍|면|동|리))(?![가-힣])", raw)
                for part in parts:
                    name = venue_key(part)
                    if len(name) >= 3 and name not in GENERIC_VENUES:
                        self.venues[region["sido"], name].add(region["sigungu_code"])

    # 반복되는 원본 행정명을 캐시해 행사 수만큼 사전 전체를 재탐색하지 않는다.
    def resolve(self, text: str | None, sido: str | None) -> tuple[dict | None, str]:
        key = (text, sido)
        if key not in self._resolved:
            self._resolved[key] = resolve_admin(text, sido, self.admin)
        return self._resolved[key]

    # 복수의 명시 지명·장소가 있으면 후보를 합치며 부모와 자식 중 자식을 우선한다.
    def candidates(self, venue_text: str, sido_hint: str | None = None) -> list[dict]:
        hits = {row["sigungu_code"]: 0.95 for row in lookup_admin(venue_text, sido_hint, self.admin)}
        key, sido = venue_key(venue_text), normalize_sido(sido_hint) or normalize_sido(venue_text)
        for (province, venue), codes in self.venues.items():
            if sido and province != sido:
                continue
            if (
                key == venue
                or (len(venue) >= 4 and venue in key)
                or (
                    venue.endswith(("읍", "면", "동", "리"))
                    and re.search(rf"(?<![가-힣]){re.escape(venue)}(?![가-힣])", venue_text)
                )
            ):
                for code in codes:
                    hits.setdefault(code, 0.8)
        parents = {self.regions[code]["parent_code"] for code in hits}
        return [
            {
                "sigunguCode": code,
                "sigunguName": self.regions[code]["sigungu_name"],
                "lat": self.regions[code]["lat"],
                "lng": self.regions[code]["lng"],
                "score": score,
            }
            for code, score in sorted(hits.items(), key=lambda item: (-item[1], item[0]))
            if code not in parents
        ]

    # 유효한 위경도인지 검사한 다음 해당 2025 다각형 내부·경계에 있는지 검증한다.
    def covers(self, code: str, lat: float, lng: float) -> bool:
        if code not in self.regions or not (33 <= lat <= 39 and 124 <= lng <= 132):
            return False
        with spatial_connection() as connection:
            return connection.execute(
                "SELECT ST_Covers(ST_GeomFromWKB(?), ST_Point(?, ?))",
                [self.regions[code]["geometry_wkb"], lng, lat],
            ).fetchone()[0]

    # 부모 시와 일반구가 겹치면 가장 작은 행정구역 후보만 반환한다.
    def locate(self, lat: float, lng: float) -> list[str]:
        if not (33 <= lat <= 39 and 124 <= lng <= 132):
            return []
        with spatial_connection() as connection:
            connection.register("regions", self.admin.to_arrow())
            found = {
                r[0]
                for r in connection.execute(
                    "SELECT sigungu_code FROM regions "
                    "WHERE ST_Covers(ST_GeomFromWKB(geometry_wkb), ST_Point(?, ?))",
                    [lng, lat],
                ).fetchall()
            }
        parents = {self.regions[code]["parent_code"] for code in found}
        return sorted(found - parents)


# 사전 생성 전에는 조용히 빈 후보를 주지 않고 필요한 산출물 누락을 알린다.
@lru_cache(maxsize=1)
def default_gazetteer() -> Gazetteer:
    return Gazetteer(
        pl.read_parquet(paths.PROCESSED / "admin_dict.parquet"),
        pl.read_parquet(paths.PROCESSED / "mcst_festivals.parquet"),
    )


# 공개 인터페이스는 네트워크를 쓰지 않으며 이미 검증된 동일 장소의 좌표만 우선한다.
def candidates(venue_text: str, sido_hint: str | None = None) -> list[dict]:
    gazetteer = default_gazetteer()
    result = gazetteer.candidates(venue_text, sido_hint)
    event_path = paths.PROCESSED / "events.parquet"
    if event_path.exists():
        rows = (
            pl.scan_parquet(event_path)
            .filter(pl.col("coord_source") == "tourapi")
            .select("venue", "sigungu_code", "lat", "lng")
            .collect()
            .to_dicts()
        )
        points: dict[str, set[tuple[float, float]]] = defaultdict(set)
        for row in rows:
            code = row["sigungu_code"]
            if not code or not venue_key(venue_text):
                continue
            hint = normalize_sido(sido_hint)
            if hint and gazetteer.regions[code]["sido"] != hint:
                continue
            if venue_key(row["venue"]) == venue_key(venue_text):
                points[row["sigungu_code"]].add((row["lat"], row["lng"]))
        # 사전에 없던 TourAPI 장소도 검증된 좌표가 있을 때 후보로 추가한다.
        present = {item["sigunguCode"] for item in result}
        for code, locations in sorted(points.items()):
            valid = {(lat, lng) for lat, lng in locations if gazetteer.covers(code, lat, lng)}
            points[code] = valid
            if code not in present and valid:
                region = gazetteer.regions[code]
                result.append({"sigunguCode": code, "sigunguName": region["sigungu_name"],
                               "lat": region["lat"], "lng": region["lng"], "score": 0.9})
        # 동일 이름의 서로 다른 장소는 좌표를 임의로 하나 선택하지 않는다.
        for item in result:
            locations = points[item["sigunguCode"]]
            if len(locations) == 1:
                lat, lng = next(iter(locations))
                if gazetteer.covers(item["sigunguCode"], lat, lng):
                    item.update(lat=lat, lng=lng)
    return sorted(result, key=lambda item: (-item["score"], item["sigunguCode"]))
