"""다가오는 행사 요약이 TourAPI 행사장 좌표만 믿고 나머지는 시군구 중심점으로 밝히는지 확인한다."""

import polars as pl
from crowdcast.api.assemble import locations


# 마스터의 좌표 출처가 tourapi인 행사만 좌표를 바꾸고 venue로 표시한다.
def test_attach_locations_marks_venue_and_centroid(monkeypatch):
    events = pl.DataFrame(
        {
            "event_id": ["e-a", "e-b"],
            "coord_source": ["tourapi", "centroid"],
            "lat": [37.51, 36.0],
            "lng": [127.06, 127.0],
        }
    )
    monkeypatch.setattr(locations, "table", lambda name: events)
    rows = [
        {"eventId": "e-a", "lat": 37.4, "lng": 127.0},
        {"eventId": "e-b", "lat": 36.1, "lng": 127.1},
        {"eventId": "e-c", "lat": 35.0, "lng": 128.0},
    ]
    result = locations.attach_locations(rows)
    assert result[0] == {"eventId": "e-a", "lat": 37.51, "lng": 127.06, "coordSource": "venue"}
    assert result[1]["coordSource"] == "centroid" and result[1]["lat"] == 36.1
    assert result[2]["coordSource"] == "centroid"
