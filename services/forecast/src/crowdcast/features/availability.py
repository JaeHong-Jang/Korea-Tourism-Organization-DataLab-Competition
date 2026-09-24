"""피처별 공개 시점을 보존하고 D-14 이후 정보의 유입을 중단한다."""

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date, datetime
from zoneinfo import ZoneInfo


# 값이 없는 피처도 같은 구조로 남겨 결측과 공개일 미상을 구분한다.
@dataclass(frozen=True)
class Feature:
    value: float | None
    available_at: date | None


# 시간대가 있는 원본 발표 시점은 한국 날짜로 정규화한다.
def publication_date(value: str | date | None) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.astimezone(ZoneInfo("Asia/Seoul")).date() if value.tzinfo else value.date()
    if isinstance(value, date):
        return value
    if "T" in value or " " in value:
        return publication_date(datetime.fromisoformat(value))
    return date.fromisoformat(value)


# 공개일 없는 원본은 추정 날짜를 붙이지 않고 학습 입력에서 결측으로 남긴다.
def published(value: float | None, available_at: str | date | None) -> Feature:
    day = publication_date(available_at)
    return Feature(value if day is not None else None, day)


# 선택된 값은 한 건이라도 공개일이 없거나 기준일 뒤이면 전체 피처 생성을 실패시킨다.
def check_availability(features: Mapping[str, Feature], as_of: date) -> None:
    for name, feature in features.items():
        if feature.value is not None and (feature.available_at is None or feature.available_at > as_of):
            raise ValueError(
                f"피처 공개 시점 위반: {name}, available_at={feature.available_at}, as_of={as_of}"
            )
