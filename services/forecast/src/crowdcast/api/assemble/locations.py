"""다가오는 행사 요약에 좌표 출처를 붙이고, TourAPI로 확인한 행사장 좌표가 있으면 그 좌표로 바꾼다."""

from typing import Any

from crowdcast.api.assemble.inputs import table


# 예보 숫자는 시군구 단위라 좌표를 바꿔도 달라지지 않는다 — 지도·동네 3D 위치만 바로잡는다.
def attach_locations(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    # 마스터가 아직 없으면 모든 좌표를 시군구 중심점으로 밝힌다.
    try:
        events = table("events")
    except FileNotFoundError:
        return [{**row, "coordSource": "centroid"} for row in rows]
    if "coord_source" not in events.columns:
        return [{**row, "coordSource": "centroid"} for row in rows]
    known = {
        row["event_id"]: row
        for row in events.select("event_id", "coord_source", "lat", "lng").iter_rows(named=True)
    }
    result = []
    for row in rows:
        master = known.get(row["eventId"])
        venue = master and master["coord_source"] == "tourapi" and None not in (master["lat"], master["lng"])
        if venue:
            lat, lng = float(master["lat"]), float(master["lng"])
            result.append({**row, "lat": lat, "lng": lng, "coordSource": "venue"})
        else:
            result.append({**row, "coordSource": "centroid"})
    return result
