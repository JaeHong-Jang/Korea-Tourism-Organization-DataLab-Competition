"""녹화한 2026년 코드와 날짜 경계로 2025 기준 변환·부모 합계·단절을 검증한다."""

import json
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import polars as pl
import pytest
from crowdcast.data.crosswalk import CODE_2026_TO_2025, INCHEON_BREAK_CODES, align_to_2025
from crowdcast.data.datago_client import DataGoClient, DataGoError
from crowdcast.data.visitors import KEY, RAW_DTYPES, normalize_visitors, read_progress, save_progress


# 실제 7월 첫 페이지를 읽되 변환 함수에 넣을 원본 8열을 별도로 유지한다.
@pytest.fixture
def july_raw() -> pl.DataFrame:
    path = Path(__file__).parent / "fixtures/datago/crosswalk_20260701_page_1.json"
    page = DataGoClient._parse(path.read_bytes(), 1, 1000)
    rows = []
    for item in page.items:
        if item["baseYmd"] != "20260701":
            continue
        day = date(2026, 7, 1)
        rows.append(
            {
                "sigungu_code": item["signguCode"],
                "sigungu_name": item["signguNm"],
                "date": day,
                "tou_div": {"1": "현지인", "2": "외지인", "3": "외국인"}[item["touDivCd"]],
                "visitors": float(item["touNum"]),
                "is_parent_city": False,
                "available_at": day + timedelta(days=4),
                "source_hash": page.source_hash,
            }
        )
    return pl.DataFrame(rows, schema=RAW_DTYPES)


# 광주·전남 이름별 고정 대응은 27개이며 다른 시도의 동명 구에는 적용하지 않는다.
def test_all_gwangju_jeonnam_codes(july_raw: pl.DataFrame, datago_recordings: list[dict[str, Any]]) -> None:
    old = normalize_visitors([DataGoClient._parse(json.dumps(datago_recordings[0]).encode(), 1, 1000)])
    old_names = dict(old.select("sigungu_code", "sigungu_name").unique().rows())
    new = align_to_2025(july_raw)
    mapped = new.filter(pl.col("raw_sigungu_code").str.starts_with("12"))
    assert mapped["sigungu_code"].n_unique() == 27 == len(CODE_2026_TO_2025)
    for raw, code, name in mapped.select("raw_sigungu_code", "sigungu_code", "sigungu_name").rows():
        assert code == CODE_2026_TO_2025[raw]
        assert name == old_names[code]
    busan = new.filter(pl.col("sigungu_code") == "26170")
    assert busan["sigungu_name"].unique().to_list() == ["동구"]
    assert busan["raw_sigungu_code"].unique().to_list() == ["26170"]


# 6월 말과 7월 초가 한 입력에 섞여도 각 행의 관측일로 원래 체계를 판정한다.
def test_mixed_code_system_boundary(july_raw: pl.DataFrame) -> None:
    old = july_raw.filter(pl.col("sigungu_code").is_in(["12210", "41590", "28260"]))
    old = old.with_columns(
        pl.col("sigungu_code").replace({"12210": "29110"}),
        pl.lit(date(2026, 6, 30)).alias("date"),
        pl.lit(date(2026, 7, 4)).alias("available_at"),
    )
    result = align_to_2025(pl.concat([old, july_raw]))
    before = result.filter(pl.col("date") == date(2026, 6, 30))
    after = result.filter(pl.col("date") == date(2026, 7, 1))
    assert before["code_system"].unique().to_list() == [2025]
    assert after["code_system"].unique().to_list() == [2026]
    assert not before["is_parent_city"].any() and not before["continuity_break"].any()
    assert set(after.filter(pl.col("is_parent_city"))["sigungu_code"]) - {"41590"} == {
        "41110",
        "41130",
        "41170",
        "41190",
        "41270",
        "41280",
        "41460",
        "43110",
        "44130",
        "52110",
        "47110",
        "48120",
    }
    assert after.filter(pl.col("sigungu_code") == "41590")["is_parent_city"].all()
    assert set(after.filter(pl.col("continuity_break"))["sigungu_code"]) == {
        "28125",
        "28155",
        "28260",
        "28275",
        "28290",
    }
    assert (
        after.filter(pl.col("continuity_break"))
        .select((pl.col("sigungu_code") == pl.col("raw_sigungu_code")).all())
        .item()
    )


# 개편 후 옛 코드가 함께 제공돼도 영향을 받는 일곱 코드는 전부 단절로 남긴다.
def test_incheon_old_and_new_group(july_raw: pl.DataFrame) -> None:
    rows = [july_raw.head(1).with_columns(pl.lit(code).alias("sigungu_code")) for code in INCHEON_BREAK_CODES]
    result = align_to_2025(pl.concat(rows))
    assert result["continuity_break"].all()
    assert set(result["sigungu_code"]) == INCHEON_BREAK_CODES


# 구 합계 불일치는 경고만 남기고 원래 부모 관측·근거 해시는 그대로 사용한다.
def test_hwaseong_parent_preserved(july_raw: pl.DataFrame, caplog: pytest.LogCaptureFixture) -> None:
    original = july_raw.filter(pl.col("sigungu_code") == "41590").sort("tou_div")
    result = align_to_2025(july_raw)
    retained = result.filter(pl.col("sigungu_code").str.starts_with("4159")).sort("tou_div")
    assert retained.height == 3
    assert retained["visitors"].equals(original["visitors"])
    assert retained["source_hash"].equals(original["source_hash"])
    assert "화성시 부모·구 합계 불일치" in caplog.text


# 일치하는 부모·구 합계에는 경고하지 않고 부모 없는 구 자료는 확정하지 않는다.
def test_hwaseong_equal_and_missing_parent(july_raw: pl.DataFrame, caplog: pytest.LogCaptureFixture) -> None:
    group = july_raw.filter(pl.col("sigungu_code").str.starts_with("4159"))
    group = group.with_columns(
        pl.when(pl.col("sigungu_code") == "41590").then(40.0).otherwise(10.0).alias("visitors")
    )
    assert align_to_2025(group).height == 3
    assert not caplog.text
    with pytest.raises(DataGoError, match="부모 행 누락"):
        align_to_2025(group.filter(pl.col("sigungu_code") != "41590"))


# 기존 8열 산출물을 호출 없이 변환하고 완료 날짜·원본 해시를 유지한다.
def test_legacy_parquet_migration(july_raw: pl.DataFrame, tmp_path: Path) -> None:
    output = tmp_path / "region_daily.parquet"
    completed = {date(2026, 7, 1)}
    save_progress(output, july_raw, completed)
    frame, dates, unavailable = read_progress(output)
    assert dates == completed and frame.height == july_raw.height - 12
    expected = align_to_2025(july_raw).with_columns(
        (pl.col("date") + pl.duration(days=35)).alias("available_at")
    )
    assert frame.equals(expected.select(frame.columns).sort(KEY)) and not unavailable
    again, dates, unavailable = read_progress(output)
    assert again.equals(frame) and dates == completed and not unavailable
