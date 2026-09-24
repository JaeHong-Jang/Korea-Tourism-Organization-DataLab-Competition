"""두 지역의 정상 신호와 비교용 저신호 지역으로 오류 주입용 일별 자료를 만든다."""

from datetime import date, timedelta
from typing import Any

import polars as pl
from label_fixtures import festival, visitors


# 실제 행사·지역 이름을 쓰되 관측값과 일정은 손으로 검산할 수 있는 합성 자료다.
def signal_inputs() -> tuple[list[dict[str, Any]], pl.DataFrame]:
    events, frames = [], []
    for year in range(2006, 2026):
        start = date(year, 7, 14)
        values = {start - timedelta(days=7 * week): 105 - 2 * week for week in range(1, 5)}
        values[start - timedelta(days=35)] = 1500
        for code, name in (("41800", "연천율무축제"), ("41480", "파주장단콩축제")):
            events.append(
                festival(
                    event_id=f"e-{year}-{code}-합성",
                    name=name,
                    year=year,
                    sigungu_code=code,
                    start=start,
                    end=start,
                )
            )
            frames.append(visitors({**values, start: 200}, code))
        frames.append(visitors({**values, start: 101}, "41150"))
    return events, pl.concat(frames)
