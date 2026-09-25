"""기상청 공식 격자표 좌표와 가이드 변환 예제로 LCC 및 입력 검증을 확인한다."""

import pytest
from crowdcast.data.weather.grid import to_grid, validate_grid


# 2026년 7월 공식 격자표의 행정구역 대표 좌표와 가이드의 역변환 예제를 사용한다.
@pytest.mark.parametrize(
    ("lat", "lng", "expected"),
    [
        (37.5703777777777, 126.981641666666, (60, 127)),  # 서울 종로구
        (35.1600194444444, 129.165808333333, (99, 75)),  # 부산 해운대구
        (37.2831027777777, 127.037833333333, (61, 121)),  # 수원 팔달구
        (33.4963111111111, 126.533208333333, (53, 38)),  # 제주시
        (37.488201, 126.929810, (59, 125)),  # 가이드 명시 예제
        (38.0, 126.0, (43, 136)),  # 투영 기준점
    ],
)
def test_official_grid(lat: float, lng: float, expected: tuple[int, int]) -> None:
    assert to_grid(lat, lng) == expected


# NaN·무한대·극점·해외 좌표는 기상청 격자로 잘못 요청하지 않는다.
@pytest.mark.parametrize(
    "lat,lng",
    [(float("nan"), 127), (37, float("inf")), (90, 127), (-90, 127), (37, 181), (0, 0), (True, 127)],
)
def test_invalid_coordinates(lat: float, lng: float) -> None:
    with pytest.raises(ValueError):
        to_grid(lat, lng)


# 소수·bool·격자 범위 밖 값을 API에 전달하지 않는다.
@pytest.mark.parametrize("nx,ny", [(0, 127), (150, 127), (60, 254), (60.5, 127), (True, 127)])
def test_invalid_grid(nx: int, ny: int) -> None:
    with pytest.raises(ValueError):
        validate_grid(nx, ny)
