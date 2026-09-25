"""공개가 끝난 직전 네 주의 요일별 평시와 구성비를 계산한다."""

from datetime import date, timedelta
from typing import Any

import polars as pl
from crowdcast.api.assemble.evidence import fragment, source
from crowdcast.api.assemble.inputs import region_rows


# 공개 자료는 있지만 완전한 네 주를 확보하지 못한 경우를 구분한다.
class NoCompleteWindow(FileNotFoundError):
    pass


# 세 집단이 모두 공개된 날만 쓰고 중복 자료를 합산해 숫자를 부풀리지 않는다.
def complete_days(frame: pl.DataFrame) -> pl.DataFrame:
    if frame.select(pl.struct("date", "tou_div").is_duplicated().any()).item():
        raise ValueError("지역 방문자 키 중복")
    if frame.filter(
        pl.col("visitors").is_null() | ~pl.col("visitors").is_finite() | (pl.col("visitors") < 0)
    ).height:
        raise ValueError("지역 방문자 수 오류")
    expected = {"현지인", "외지인", "외국인"}
    if set(frame["tou_div"].unique()) - expected:
        raise ValueError("알 수 없는 방문자 구분")
    valid = frame.group_by("date").agg(pl.col("tou_div").n_unique().alias("groups"))
    return frame.join(valid.filter(pl.col("groups") == 3).select("date"), on="date")


# 최신 공개 관측일부터 주 단위로 최대 네 번 더 거슬러 완전한 28일을 찾는다.
def complete_window(frame: pl.DataFrame) -> pl.DataFrame:
    if frame.is_empty():
        raise FileNotFoundError("공개된 직전 네 주 평시 자료가 없습니다")
    last = frame["date"].max()
    frame = complete_days(frame)
    for weeks in range(5):
        end = last - timedelta(weeks=weeks)
        start = end - timedelta(days=27)
        window = frame.filter(pl.col("date").is_between(start, end))
        if window["date"].n_unique() == 28:
            return window.sort("date", "tou_div")
    raise NoCompleteWindow("공개된 자료에서 최대 4주 더 거슬러도 세 집단이 모두 있는 연속 28일이 없어요")


# 결측 날짜와 공개일 없는 숫자는 영으로 채우지 않고 조회 불가로 반환한다.
def baseline(code: str, before: date) -> dict[str, Any]:
    frame = complete_window(region_rows(code, before))
    first, last = frame["date"].min(), frame["date"].max()
    grouped = frame.with_columns((pl.col("date").dt.weekday() - 1).alias("weekday"))
    grouped = grouped.group_by("weekday", "tou_div").agg(pl.col("visitors").mean())
    index = {(row["weekday"], row["tou_div"]): row["visitors"] for row in grouped.to_dicts()}
    weekdays = [
        {
            "weekday": day,
            "local": index[day, "현지인"],
            "nonlocal": index[day, "외지인"],
            "foreign": index[day, "외국인"],
        }
        for day in range(7)
    ]
    total = float(frame["visitors"].sum())
    if total <= 0:
        raise FileNotFoundError("방문자 합계가 없어 구성비를 계산할 수 없습니다")
    share = float(frame.filter(pl.col("tou_div") == "외지인")["visitors"].sum() / total)
    result = {
        "sigunguCode": code,
        "sigunguName": frame.sort("date")["sigungu_name"][-1],
        "period": {"from": first.isoformat(), "to": last.isoformat()},
        "weekdayMean": weekdays,
        "nonlocalShare": share,
    }

    # 같은 지역·기준일의 API와 예보 조립은 근거 내용과 식별자까지 재사용한다.
    evidence = fragment(
        "data",
        "개최지 평시 방문",
        {**result, "unit": "명/일", "shareUnit": "비율"},
        period=result["period"],
        source=source("silver"),
        availableAt=frame["available_at"].max().isoformat(),
    )
    return {**result, "evidenceId": evidence["id"], "evidence": [evidence]}
