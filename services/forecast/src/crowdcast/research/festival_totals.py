"""문체부 지역축제 개최계획의 주최 측 발표 방문객으로 연도별 총 방문객과 2026 추세 예측을 만든다."""

import argparse
import json
from pathlib import Path

import polars as pl

YEARS = range(2017, 2026)
COVID = (2020, 2021, 2022)
# "천명" 머리글을 쓴 계획서(2017~2021)는 명 단위로 적힌 값이 1,000배로 부풀어 있다.
THOUSAND_HEADER_PLANS = range(2017, 2022)
UNIT_ERROR_AT = 10_000_000


# 계획서 연도 Y에 적힌 방문객은 Y-1년 실적이다. 단위 오류를 고친 뒤 방문 연도별로 합친다.
def yearly_totals(festivals: pl.DataFrame) -> list[dict]:
    planned = dict(festivals.group_by("year").len().iter_rows())
    reported = (
        festivals.filter(pl.col("visitors_announced").is_not_null())
        .with_columns(
            (pl.col("year") - 1).alias("visit_year"),
            pl.when(
                pl.col("year").is_in(list(THOUSAND_HEADER_PLANS))
                & (pl.col("visitors_announced") >= UNIT_ERROR_AT)
            )
            .then(pl.col("visitors_announced") / 1000)
            .otherwise(pl.col("visitors_announced"))
            .alias("visitors"),
        )
        .group_by("visit_year")
        .agg(pl.len().alias("reported"), pl.col("visitors").sum().alias("total"))
    )
    rows = {row["visit_year"]: row for row in reported.iter_rows(named=True)}
    return [
        {
            "year": year,
            "total": round(rows[year]["total"]),
            "reported": rows[year]["reported"],
            "planned": planned.get(year),
            "covid": year in COVID,
        }
        for year in YEARS
    ]


# 코로나 이후 보고 규모가 비슷한 두 해의 성장률을 2025년에 적용한다(중앙=평균, 범위=최소~최대).
def forecast_2026(points: list[dict]) -> dict:
    by_year = {point["year"]: point["total"] for point in points}
    growth = [by_year[2024] / by_year[2023] - 1, by_year[2025] / by_year[2024] - 1]
    base = by_year[2025]
    return {
        "year": 2026,
        "value": round(base * (1 + sum(growth) / len(growth))),
        "low": round(base * (1 + min(growth))),
        "high": round(base * (1 + max(growth))),
        "growth": [round(item, 4) for item in growth],
        "method": "2023→2024, 2024→2025 성장률의 평균(중앙)과 최소~최대(범위)를 2025년에 적용",
    }


# 화면용 상수 파일을 쓴다. 머리 주석에 재생성 명령을 남겨 손으로 고치지 않게 한다.
def write(points: list[dict], forecast: dict, output: Path) -> None:
    body = json.dumps(
        {
            "source": "문화체육관광부 지역축제 개최계획(2018~2026년) · 주최 측 발표 전년도 방문객",
            "unitFix": "2017~2021년 계획서(천명 머리글)에서 1,000만 명 이상 값은 1,000으로 나눔",
            "points": points,
            "forecast": forecast,
        },
        ensure_ascii=False,
        indent=2,
    )
    output.write_text(
        "// 문체부 개최계획에서 생성한 연도별 축제 총 방문객과 2026 추세 예측이다. 손으로 고치지 않는다.\n"
        "// 재생성: python -m crowdcast.research.festival_totals --festivals <mcst_festivals.parquet> "
        "--output apps/web/src/features/validation/festival-visitors-data.ts\n"
        f"export const festivalVisitors = {body} as const;\n",
        encoding="utf-8",
    )


# CLI는 원자료 경로와 출력 경로만 받는다.
if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--festivals", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    points = yearly_totals(pl.read_parquet(args.festivals))
    forecast = forecast_2026(points)
    write(points, forecast, args.output)
    print(json.dumps({"points": points, "forecast": forecast}, ensure_ascii=False))
