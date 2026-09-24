"""2026년 방문자 코드를 2025년 기준으로 맞추고 부모 합계와 인천 단절을 보존한다."""

import logging
import math
from datetime import date

import polars as pl

from crowdcast.data.datago_client import DataGoError

CODE_CHANGE_DATE = date(2026, 7, 1)
PARENT_CITY_CODES = frozenset(
    {
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
)
PARENT_CITY_CODES_2026 = PARENT_CITY_CODES | {"41590"}
HWASEONG_DISTRICTS = frozenset({"41591", "41593", "41595", "41597"})
INCHEON_BREAK_CODES = frozenset({"28110", "28140", "28260", "28125", "28155", "28275", "28290"})

# 시도 안의 이름으로 확인한 27개 대응만 고정해 다른 시도의 동명 구와 섞지 않는다.
CODE_2026_TO_2025 = {
    "12210": "29110",  # 광주 동구
    "12240": "29140",  # 광주 서구
    "12270": "29155",  # 광주 남구
    "12300": "29170",  # 광주 북구
    "12330": "29200",  # 광주 광산구
    "12110": "46110",  # 전남 목포시
    "12130": "46130",  # 전남 여수시
    "12150": "46150",  # 전남 순천시
    "12170": "46170",  # 전남 나주시
    "12190": "46230",  # 전남 광양시
    "12710": "46710",  # 전남 담양군
    "12720": "46720",  # 전남 곡성군
    "12730": "46730",  # 전남 구례군
    "12740": "46770",  # 전남 고흥군
    "12750": "46780",  # 전남 보성군
    "12760": "46790",  # 전남 화순군
    "12770": "46800",  # 전남 장흥군
    "12780": "46810",  # 전남 강진군
    "12790": "46820",  # 전남 해남군
    "12800": "46830",  # 전남 영암군
    "12810": "46840",  # 전남 무안군
    "12820": "46860",  # 전남 함평군
    "12830": "46870",  # 전남 영광군
    "12840": "46880",  # 전남 장성군
    "12850": "46890",  # 전남 완도군
    "12860": "46900",  # 전남 진도군
    "12870": "46910",  # 전남 신안군
}
LOGGER = logging.getLogger(__name__)


# 부모가 없으면 합계를 지어내지 않고, 구 합계와 다르면 원본 부모를 유지하며 알린다.
def check_hwaseong(frame: pl.DataFrame) -> None:
    selected = frame.filter(
        (pl.col("date") >= CODE_CHANGE_DATE) & pl.col("sigungu_code").is_in(HWASEONG_DISTRICTS | {"41590"})
    )
    mismatches = []
    for (day, category), group in selected.partition_by(["date", "tou_div"], as_dict=True).items():
        parent = group.filter(pl.col("sigungu_code") == "41590")
        districts = group.filter(pl.col("sigungu_code").is_in(HWASEONG_DISTRICTS))
        if parent.height != 1:
            raise DataGoError(f"화성시 부모 행 누락: date={day}, tou_div={category}")
        total = math.fsum(districts["visitors"])
        value = parent["visitors"][0]
        if districts.height != 4 or not math.isclose(value, total, rel_tol=1e-9, abs_tol=0.01):
            mismatches.append(f"{day}/{category}: 부모={value}, 구합계={total}, 구수={districts.height}")
    if mismatches:
        LOGGER.warning(
            "화성시 부모·구 합계 불일치 %d건; 부모 원본 유지; 예시: %s",
            len(mismatches),
            "; ".join(mismatches[:3]),
        )


# 원래 코드 체계와 부모 여부를 먼저 표시한 뒤 1:1 변환과 화성 구 제거를 적용한다.
def align_to_2025(frame: pl.DataFrame) -> pl.DataFrame:
    check_hwaseong(frame)
    changed = pl.col("date") >= CODE_CHANGE_DATE
    code = pl.col("sigungu_code")
    return (
        frame.with_columns(
            code.alias("raw_sigungu_code"),
            pl.when(changed).then(2026).otherwise(2025).cast(pl.Int32).alias("code_system"),
            (changed & code.is_in(INCHEON_BREAK_CODES)).alias("continuity_break"),
            pl.when(changed)
            .then(code.is_in(PARENT_CITY_CODES_2026))
            .otherwise(code.is_in(PARENT_CITY_CODES))
            .alias("is_parent_city"),
        )
        .filter(~(changed & code.is_in(HWASEONG_DISTRICTS)))
        .with_columns(
            pl.when(changed).then(code.replace(CODE_2026_TO_2025)).otherwise(code).alias("sigungu_code")
        )
    )
