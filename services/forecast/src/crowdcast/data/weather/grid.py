"""기상청 공개 LCC 식으로 위경도를 5km 단기예보 격자로 변환한다."""

import math

# 기상청41 활용가이드의 0기반 원점(42, 135)에 API의 1기반 격자 오프셋을 더한다.
# https://www.data.go.kr/data/15084084/openapi.do (2026년 7월 첨부 가이드)
EARTH_RADIUS_KM = 6371.00877
GRID_KM = 5.0
ORIGIN_X, ORIGIN_Y = 43, 136


# 지구상 좌표를 LCC로 투영하되 기상청 격자 영역 밖은 조회 전에 거절한다.
def to_grid(lat: float, lng: float) -> tuple[int, int]:
    if (
        isinstance(lat, bool)
        or isinstance(lng, bool)
        or not math.isfinite(lat)
        or not math.isfinite(lng)
        or not -90 < lat < 90
        or not -180 <= lng <= 180
    ):
        raise ValueError("유효한 위도·경도가 필요합니다")

    # 표준위도 30·60도와 기준점 126·38도로 원추 투영 계수를 계산한다.
    first, second = math.radians(30), math.radians(60)
    exponent = math.log(math.cos(first) / math.cos(second)) / math.log(
        math.tan(math.pi / 4 + second / 2) / math.tan(math.pi / 4 + first / 2)
    )
    scale = math.tan(math.pi / 4 + first / 2) ** exponent * math.cos(first) / exponent
    radius = EARTH_RADIUS_KM / GRID_KM * scale
    origin_radius = radius / math.tan(math.pi / 4 + math.radians(38) / 2) ** exponent
    projected_radius = radius / math.tan(math.pi / 4 + math.radians(lat) / 2) ** exponent
    theta = (math.radians(lng - 126) + math.pi) % (2 * math.pi) - math.pi
    theta *= exponent

    # 기상청 반올림식 floor(x + 0.5)을 사용해 은행가 반올림과의 차이를 막는다.
    nx = math.floor(projected_radius * math.sin(theta) + ORIGIN_X + 0.5)
    ny = math.floor(origin_radius - projected_radius * math.cos(theta) + ORIGIN_Y + 0.5)
    validate_grid(nx, ny)
    return nx, ny


# 공식 동서 149칸·남북 253칸 격자에 속하는 정수 좌표만 전송한다.
def validate_grid(nx: int, ny: int) -> None:
    if type(nx) is not int or type(ny) is not int or not (1 <= nx <= 149 and 1 <= ny <= 253):
        raise ValueError("기상청 격자 범위는 nx=1~149, ny=1~253입니다")
