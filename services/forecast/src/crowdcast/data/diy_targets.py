"""장소·일정이 있는 중소 행사를 지역·유형별로 고르게 골라 DIY 조회 순서를 만든다."""

from collections import Counter

import polars as pl

from crowdcast.data import DIY_DTYPES, DIY_SCHEMA, FESTIVAL_SCHEMA
from crowdcast.paths import PROCESSED


# 중소 행사를 먼저 고르고 현재 적게 뽑힌 시도·유형·연도를 결정적으로 우선한다.
def select_targets(festivals: pl.DataFrame, count: int = 60) -> pl.DataFrame:
    FESTIVAL_SCHEMA.validate(festivals, lazy=True)
    if count < 60:
        raise ValueError("DIY 대상은 60건 이상이어야 한다")
    candidates = (
        festivals.filter(
            pl.col("year").is_between(2023, 2025)
            & pl.all_horizontal(
                pl.col(name).is_not_null()
                for name in (
                    "sido",
                    "venue",
                    "start_date",
                    "end_date",
                    "days",
                )
            )
            & ~pl.col("venue").str.contains("미정|미확정|추후|온라인|비대면")
        )
        .sort(["source_file", "source_sheet", "source_row"])
        .unique(
            subset=["year", "sido", "sigungu_name", "festival_name", "start_date", "end_date"],
            maintain_order=True,
        )
        .with_columns(pl.col("visitors_announced").is_between(500, 20_000).fill_null(False).alias("small"))
    )
    if candidates.height < count:
        raise ValueError(f"장소·일정이 확인된 DIY 후보 부족: {candidates.height}건 < {count}건")

    # 동일 점수에서는 원본 위치로 순서를 고정해 재실행해도 같은 목록을 만든다.
    remaining = candidates.to_dicts()
    sido_counts, type_counts, year_counts = Counter(), Counter(), Counter()
    selected = []
    while remaining and len(selected) < count:
        chosen = min(
            range(len(remaining)),
            key=lambda i: (
                not remaining[i]["small"],
                sido_counts[remaining[i]["sido"]] + type_counts[remaining[i]["type"]],
                sido_counts[remaining[i]["sido"]],
                type_counts[remaining[i]["type"]],
                year_counts[remaining[i]["year"]],
                remaining[i]["source_file"],
                remaining[i]["source_sheet"],
                remaining[i]["source_row"],
            ),
        )
        festival = remaining.pop(chosen)
        reason = "발표 방문객 500~20,000명 중소 행사 우선" if festival["small"] else "중소 후보 소진 후 보완"
        record = {name: festival[name] for name in DIY_DTYPES if name not in {"priority", "why"}}
        record.update(
            priority=len(selected) + 1,
            why=f"{reason}; {festival['sido']}·{festival['type']} 분산; 발표치는 라벨 아님",
        )
        selected.append(record)
        sido_counts[festival["sido"]] += 1
        type_counts[festival["type"]] += 1
        year_counts[festival["year"]] += 1
    return DIY_SCHEMA.validate(pl.DataFrame(selected, schema=DIY_DTYPES), lazy=True)


# 사람이 바로 열어볼 수 있도록 날짜를 ISO 형식으로 보존한 UTF-8 CSV를 쓴다.
def main() -> None:
    festivals = pl.read_parquet(PROCESSED / "mcst_festivals.parquet")
    targets = select_targets(festivals)
    targets.write_csv(PROCESSED / "diy_targets.csv", include_bom=True)
    print(f"DIY 대상 {targets.height}행 저장: {PROCESSED / 'diy_targets.csv'}")


if __name__ == "__main__":
    main()
