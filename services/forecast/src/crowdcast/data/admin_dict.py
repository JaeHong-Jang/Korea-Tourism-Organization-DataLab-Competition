"""2025년 경계와 방문자 코드로 부모 시·옛 이름을 보존한 행정구역 사전을 만든다."""

import re
from pathlib import Path

import duckdb
import polars as pl

from crowdcast import paths
from crowdcast.data import SIDO_ALIASES
from crowdcast.data.crosswalk import PARENT_CITY_CODES

# 시도 코드는 경계 정본의 2025 체계를 사용한다.
SIDO_CODES = dict(
    zip(
        (
            "11",
            "26",
            "27",
            "28",
            "29",
            "30",
            "31",
            "36",
            "41",
            "51",
            "43",
            "44",
            "52",
            "46",
            "47",
            "48",
            "50",
        ),
        SIDO_ALIASES.values(),
        strict=True,
    )
)
SIDO_NAMES = {
    **SIDO_ALIASES,
    **{v: v for v in SIDO_ALIASES.values()},
    "강원도": "강원특별자치도",
    "전라북도": "전북특별자치도",
    "제주도": "제주특별자치도",
    "세종시": "세종특별자치시",
}


# 공백·구두점만 제거해 같은 표기의 비교 키를 만든다.
def compact(value: object) -> str:
    return re.sub(r"[^가-힣a-z0-9]", "", str(value or "").lower())


# 짧은 시도명은 독립된 말일 때만 읽어 경기도 광주시를 광주광역시로 오인하지 않는다.
def normalize_sido(value: str | None) -> str | None:
    raw = value or ""
    if raw in SIDO_NAMES:
        return SIDO_NAMES[raw]
    found = {
        name
        for alias, name in SIDO_NAMES.items()
        if (len(alias) >= 4 and alias in raw) or re.search(rf"(?<![가-힣]){alias}(?![가-힣])", raw)
    }
    return next(iter(found)) if len(found) == 1 else None


# 확장은 승인된 설치 단계에서만 내려받고 테스트·조회에서는 로컬 파일만 연다.
def spatial_connection(*, install: bool = False) -> duckdb.DuckDBPyConnection:
    connection = duckdb.connect(
        config={
            "extension_directory": str(paths.CACHE / "duckdb"),
            "autoinstall_known_extensions": "false",
            "threads": "2",
        }
    )
    try:
        if install:
            connection.execute("INSTALL spatial FROM 'https://extensions.duckdb.org'")
        connection.execute("LOAD spatial")
    except duckdb.Error:
        connection.close()
        raise RuntimeError("DuckDB spatial 로드 실패: events --install-spatial로 먼저 설치하세요") from None
    return connection


# 구의 단독 이름과 시·군의 줄임 이름은 중복을 허용해 후보를 하나로 단정하지 않는다.
def region_aliases(name: str, code: str) -> list[str]:
    aliases = {name, name.split()[-1]}
    if name.endswith(("시", "군")) and len(name) > 2:
        aliases.add(name[:-1])
    if code == "28177":
        aliases.add("남구")
    if code == "36110":
        aliases.update(("세종", "세종시"))
    return sorted(aliases)


# 경계의 이름을 우선하고 API에서 경계에 없는 부모 시만 보충한다.
def build_admin(regions: pl.DataFrame, boundary: Path) -> pl.DataFrame:
    with spatial_connection() as connection:
        boundary_rows = connection.execute(
            "SELECT sgg AS code, name, sidonm AS sido, ST_AsWKB(geom) AS geometry "
            "FROM ST_Read(?) ORDER BY sgg",
            [str(boundary)],
        ).fetchall()
        records = {
            code: {
                "sigungu_code": code,
                "sigungu_name": name,
                "sido": sido,
                "geometry_wkb": bytes(geometry),
                "source": ["boundary"],
            }
            for code, name, sido, geometry in boundary_rows
        }
        # 2026 신규 코드는 사전에 넣지 않고 2025 API 행만 합친다.
        if "code_system" in regions.columns:
            regions = regions.filter(pl.col("code_system") == 2025)
        for item in regions.select("sigungu_code", "sigungu_name").unique().sort("sigungu_code").to_dicts():
            code = item["sigungu_code"]
            if code in records:
                records[code]["source"] = ["boundary", "visitors"]
            elif code in PARENT_CITY_CODES:
                records[code] = {**item, "sido": SIDO_CODES[code[:2]], "source": ["visitors"]}
            else:
                raise ValueError(f"2025 경계에 없는 방문자 코드: {code}")
        # 부모 중심은 자식 구 다각형의 합집합으로 구해 단순 평균의 왜곡을 피한다.
        for code, row in records.items():
            if code in PARENT_CITY_CODES:
                children = [r["geometry_wkb"] for c, r in records.items() if c != code and c[:4] == code[:4]]
                if not children:
                    raise ValueError(f"부모 시 경계 누락: {code}")
                row["geometry_wkb"] = bytes(
                    connection.execute(
                        "SELECT ST_AsWKB(ST_Union_Agg(ST_GeomFromWKB(g))) FROM unnest(?) t(g)",
                        [children],
                    ).fetchone()[0]
                )
            lng, lat = connection.execute(
                "SELECT ST_X(g), ST_Y(g) FROM (SELECT ST_Centroid(ST_GeomFromWKB(?)) g)",
                [row["geometry_wkb"]],
            ).fetchone()
            parent = code[:4] + "0"
            row.update(
                sido_code=code[:2],
                aliases=region_aliases(row["sigungu_name"], code),
                sido_aliases=sorted(k for k, v in SIDO_NAMES.items() if v == row["sido"]),
                parent_code=parent if parent != code and parent in PARENT_CITY_CODES else None,
                is_parent_city=code in PARENT_CITY_CODES,
                lat=lat,
                lng=lng,
                code_system=2025,
            )
    return pl.from_dicts(list(records.values())).sort("sigungu_code")


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
