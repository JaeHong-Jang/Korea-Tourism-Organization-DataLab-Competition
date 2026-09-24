"""데이터랩 연도별 방문자 CSV의 원문 열과 출처를 골드A 라벨로 옮긴다."""

import csv
from pathlib import Path
from typing import Any

from crowdcast.data.admin_dict import normalize_sido
from crowdcast.data.events import normalized_name
from crowdcast.labels.matching import EventMatcher
from crowdcast.labels.schema import flag, integer, label_row, number

# 오타를 포함한 실제 데이터랩 열 이름을 그대로 계약으로 삼는다.
SUFFIX = "_연도별 방문자 추이.csv"
REQUIRED = {
    "축제명",
    "개최년도",
    "축체기간(일)",
    "(현지인)방문자수",
    "(외지인)방문자수",
    "(외국인)방문자수",
    "(전체)방문자수",
    "일평균 방문자수",
}


# 원본에 시도가 없으면 같은 내려받기의 축제 자체 목적지 주소로만 보완한다.
def source_sido(path: Path, raw: dict[str, str]) -> tuple[str | None, str]:
    explicit = raw.get("시도") or raw.get("시도명") or raw.get("sido")
    if explicit:
        return normalize_sido(explicit), "시도 열"
    companion = path.with_name(path.name.removesuffix(SUFFIX) + "_목적지 검색순위.csv")
    regions = set()
    if companion.exists():
        with companion.open(encoding="utf-8-sig", newline="") as stream:
            for item in csv.DictReader(stream):
                if normalized_name(item.get("목적지명", "")) == normalized_name(raw["축제명"]):
                    if region := normalize_sido(item.get("도로명주소")):
                        regions.add(region)
    return (
        (next(iter(regions)), f"시도 근거={companion.name}:축제 목적지 주소")
        if len(regions) == 1
        else (None, "시도 근거 없음 또는 상충")
    )


# 입력 폴더·파일 순서를 고정하고 미매칭도 축제명·연도·행 번호로 추적한다.
def build_gold_a(
    data: Path,
    matcher: EventMatcher,
    unmatched: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    files = sorted(
        {p for folder in data.glob("*데이터랩*") if folder.is_dir() for p in folder.rglob(f"*{SUFFIX}")}
    )
    labels = []
    for path in files:
        source = path.relative_to(data).as_posix()
        with path.open(encoding="utf-8-sig", newline="") as stream:
            reader = csv.DictReader(stream)
            if not REQUIRED.issubset(reader.fieldnames or []):
                raise ValueError(f"골드A 필수 열 누락: {source}")
            for position, raw in enumerate(reader, 2):
                year = integer(raw["개최년도"])
                sido, region_method = source_sido(path, raw)
                event = matcher.match(raw["축제명"], year, sido, source, position, unmatched)
                if event is None:
                    continue
                labels.append(parse_row(raw, event, source, position, region_method))
    return labels


# 구분별 기간 합계는 일수로 나눠 일 단위로 맞추고 원본 전체 합계도 보존한다.
def parse_row(
    raw: dict[str, str],
    event: dict[str, Any],
    source: str,
    position: int,
    region_method: str,
) -> dict[str, Any]:
    row = label_row(event, "goldA", source, str(position))
    days = integer(raw["축체기간(일)"])
    if days <= 0:
        raise ValueError(f"골드A 축제기간은 양수여야 합니다: {source}:{position}")
    daily, total = number(raw["일평균 방문자수"]), number(raw["(전체)방문자수"])
    if daily is None or total is None:
        raise ValueError(f"골드A 방문자 수 누락: {source}:{position}")
    row.update(
        daily_mean=daily,
        total=total,
        days=days,
        method=f"일평균 방문자수 원문; 구분별 기간 합계/축체기간(일); {region_method}",
    )
    for field, original in (("local", "현지인"), ("nonlocal", "외지인"), ("foreign", "외국인")):
        value = number(raw[f"({original})방문자수"])
        row[field] = value / days if value is not None else None
    if total <= 0 or abs(daily - total / days) > abs(total / days) * 0.01:
        flag(row, "mean_total_mismatch_gt_1pct")
    if event["start"] and event["end"] and (event["end"] - event["start"]).days + 1 != days:
        flag(row, "event_days_mismatch")
    return row
