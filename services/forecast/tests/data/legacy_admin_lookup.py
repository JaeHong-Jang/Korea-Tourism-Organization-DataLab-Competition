"""T-102b 최적화 전 행정명 조회·장소 색인·후보 함수를 동등성 비교용으로 보존한다."""

import re
from collections import defaultdict

import polars as pl
from crowdcast.data.admin_dict import compact, normalize_sido
from crowdcast.data.geocode import GENERIC_VENUES, venue_key


# 독립된 짧은 별칭 또는 정식 행정명만 찾아 장소명 속 우연한 부분 문자열을 줄인다.
def lookup_admin(text: str | None, sido_hint: str | None, admin: pl.DataFrame) -> list[dict]:
    raw, key = str(text or ""), compact(text)
    if not key:
        return []
    sido = normalize_sido(sido_hint) or normalize_sido(raw)
    # 군위군은 2025 경계상 대구이므로 과거 경북 표기도 그 정본으로 옮긴다.
    if "군위군" in key and sido == "경상북도":
        sido = "대구광역시"
    spans = []
    for row in admin.to_dicts():
        if sido and row["sido"] != sido:
            continue
        for alias in row["aliases"]:
            normal = compact(alias)
            full = alias.endswith(("시", "군", "구")) and len(normal) >= 2
            short = re.search(rf"(?<![가-힣]){re.escape(alias)}(?![가-힣])", raw)
            if normal == key or full or short:
                spans.extend((match.start(), match.end(), row) for match in re.finditer(normal, key))
    # 남양주시 안의 양주시 같은 부분 이름을 제거하되 서로 다른 위치의 지명은 남긴다.
    hits = {
        row["sigungu_code"]: row
        for start, end, row in spans
        if not any(a <= start and end <= b and b - a > end - start for a, b, _ in spans)
    }
    hits = list(hits.values())
    # 수원시 장안구처럼 자식이 명시되면 동시에 잡힌 수원시 부모를 제거한다.
    parents = {row["parent_code"] for row in hits if row["parent_code"]}
    return [row for row in hits if row["sigungu_code"] not in parents]


# 시·도 자체 행사 중 세종만 기초구역이 하나이므로 해당 코드로 확정할 수 있다.
def resolve_admin(text: str | None, sido: str | None, admin: pl.DataFrame) -> tuple[dict | None, str]:
    hits = lookup_admin(text, sido, admin)
    if not hits and normalize_sido(sido) == "세종특별자치시":
        hits = admin.filter(pl.col("sigungu_code") == "36110").to_dicts()
    if len(hits) != 1:
        return None, "ambiguous" if hits else "none"
    row = hits[0]
    match = "parent" if row["is_parent_city"] else "exact" if text == row["sigungu_name"] else "alias"
    return row, match


# 행정 사전과 근거가 있는 장소 인덱스를 한 실행에서 재사용한다.
class LegacyGazetteer:
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
