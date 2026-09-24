"""문체부 행사 표와 DIY 대상 표의 열·검증 규칙·품질 보고를 정의한다."""

import duckdb
import pandera.polars as pa
import polars as pl

# 계약의 행사 유형과 문체부 분류를 연결하며 복합·미상 분류는 기타로 남긴다.
EVENT_TYPES = ("불꽃", "공연", "대학", "먹거리", "꽃", "전통", "기타")
TYPE_MAPPING = {value: value for value in EVENT_TYPES}
TYPE_MAPPING |= {
    "문화예술": "공연",
    "전통역사": "전통",
    "전통문화": "전통",
    "생태자연": "꽃",
    "자연생태": "꽃",
    "지역특산물": "먹거리",
    "특산물": "먹거리",
    "주민화합": "기타",
    "기타(주민화합)": "기타",
    "기타(주민화합등)": "기타",
}

# 시도 명칭만 통일하고 시군구 코드나 행정구역은 추정하지 않는다.
SIDO_ALIASES = {
    "서울": "서울특별시",
    "부산": "부산광역시",
    "대구": "대구광역시",
    "인천": "인천광역시",
    "광주": "광주광역시",
    "대전": "대전광역시",
    "울산": "울산광역시",
    "세종": "세종특별자치시",
    "경기": "경기도",
    "강원": "강원특별자치도",
    "충북": "충청북도",
    "충남": "충청남도",
    "전북": "전북특별자치도",
    "전남": "전라남도",
    "경북": "경상북도",
    "경남": "경상남도",
    "제주": "제주특별자치도",
}

# 미정인 일정과 미집계 수치는 null을 허용하되 존재하는 값의 타입은 고정한다.
FESTIVAL_DTYPES = {
    "year": pl.Int64,
    "sido": pl.String,
    "sigungu_name": pl.String,
    "festival_name": pl.String,
    "type_raw": pl.String,
    "type": pl.String,
    "start_date": pl.Date,
    "end_date": pl.Date,
    "days": pl.Int64,
    "date_text": pl.String,
    "planned_month": pl.Int64,
    "venue": pl.String,
    "host": pl.String,
    "budget_krw": pl.Int64,
    "visitors_announced": pl.Int64,
    "visitors_announced_meaning": pl.String,
    "source_file": pl.String,
    "source_sheet": pl.String,
    "source_row": pl.Int64,
}
DIY_DTYPES = {
    "priority": pl.Int64,
    **{
        name: FESTIVAL_DTYPES[name]
        for name in (
            "festival_name",
            "year",
            "sido",
            "sigungu_name",
            "venue",
            "start_date",
            "end_date",
            "days",
            "visitors_announced",
        )
    },
    "why": pl.String,
}


# 일정의 일부가 미정이어도 알려진 시작·종료일의 역전과 일수 불일치를 잡는다.
def period_checks() -> list[pa.Check]:
    return [
        pa.Check(
            lambda data: data.lazyframe.select((pl.col("end_date") >= pl.col("start_date")).fill_null(True)),
            name="date_order",
        ),
        pa.Check(
            lambda data: data.lazyframe.select(
                (pl.col("days") == (pl.col("end_date") - pl.col("start_date")).dt.total_days() + 1).fill_null(
                    True
                )
            ),
            name="inclusive_days",
        ),
        pa.Check(
            lambda data: data.lazyframe.select(
                pl.col("start_date").is_null() | pl.col("end_date").is_null() | pl.col("days").is_not_null()
            ),
            name="known_period_has_days",
        ),
    ]


# 원본 위치의 중복과 필수 식별자 누락을 실패로 처리한다.
FESTIVAL_SCHEMA = pa.DataFrameSchema(
    {
        name: pa.Column(
            dtype,
            nullable=name
            not in {
                "year",
                "festival_name",
                "type",
                "source_file",
                "source_sheet",
                "source_row",
            },
        )
        for name, dtype in FESTIVAL_DTYPES.items()
    },
    checks=period_checks(),
    strict=True,
    unique=["source_file", "source_sheet", "source_row"],
)
FESTIVAL_SCHEMA.columns["year"].checks = [pa.Check.in_range(2017, 2026)]
FESTIVAL_SCHEMA.columns["type"].checks = [pa.Check.isin(EVENT_TYPES)]
FESTIVAL_SCHEMA.columns["planned_month"].checks = [pa.Check.in_range(1, 12)]
for column in ("days", "source_row"):
    FESTIVAL_SCHEMA.columns[column].checks = [pa.Check.ge(1)]
for column in ("budget_krw", "visitors_announced"):
    FESTIVAL_SCHEMA.columns[column].checks = [pa.Check.ge(0)]
for column in ("festival_name", "source_file", "source_sheet"):
    FESTIVAL_SCHEMA.columns[column].checks = [pa.Check.str_length(min_value=1)]

# DIY는 장소와 일정이 있는 실제 조회 가능 후보만 받으며 우선순위는 유일하다.
DIY_SCHEMA = pa.DataFrameSchema(
    {
        name: pa.Column(dtype, nullable=name in {"sigungu_name", "visitors_announced"})
        for name, dtype in DIY_DTYPES.items()
    },
    checks=period_checks(),
    strict=True,
    unique=["priority"],
)
DIY_SCHEMA.columns["year"].checks = [pa.Check.in_range(2023, 2025)]
for column in ("priority", "days"):
    DIY_SCHEMA.columns[column].checks = [pa.Check.ge(1)]
DIY_SCHEMA.columns["visitors_announced"].checks = [pa.Check.ge(0)]
for column in ("festival_name", "sido", "venue", "why"):
    DIY_SCHEMA.columns[column].checks = [pa.Check.str_length(min_value=1)]


# 누락 연도도 0행으로 표시하고 모든 필수 출력 열의 결측률과 미매핑 분류를 공개한다.
def quality_report(frame: pl.DataFrame) -> str:
    # 날짜·예산·개최 달을 연도별로 집계해 특정 양식의 손실을 찾는다.
    with duckdb.connect() as connection:
        connection.register("festivals", frame.to_arrow())
        counts = dict(connection.sql("SELECT year, count(*) FROM festivals GROUP BY year").fetchall())
        coverage = connection.sql("""
            SELECT year, count(*), count(budget_krw), count(planned_month),
                   count(*) FILTER (WHERE start_date IS NOT NULL AND end_date IS NOT NULL)
            FROM festivals GROUP BY year ORDER BY year
        """).fetchall()
    # 원문 보존 방식과 보류 규칙을 함께 적어 다음 행사 마스터 작업의 검토를 돕는다.
    lines = [
        "# 문체부 개최계획 품질 보고",
        "",
        "참고용 — 담당자 검토 필수",
        "",
        "발표 방문객은 라벨이 아니며 원문 열 제목의 기준연도를 따른다. 공개 시점은 별도 확인해야 한다.",
        "날짜·기간 미정, 반복·복합 일정, 명시 일수와 구간 길이가 다른 일정은 날짜를 null로 보류한다.",
        "명확한 단일 구간은 양 끝 포함 일수로 계산하고, 날짜 미정 시 명시 일수만 보존한다.",
        "끝의 상태 표기((예정)·예정·(잠정)·(유동적)·(안)·(예상)·(확정)·(종료)·(변경가능))와 "
        "반복된 점을 정리한 뒤 기간 전체가 일치해야 날짜를 채운다.",
        "date_text는 단일 날짜 셀의 공백·줄바꿈까지 보존한다. "
        "분리 연월일은 start/end 배열과 days/note를 JSON으로 보존한다.",
        "planned_month는 확실한 단일 개최 달만 담는다. 두 달 이상인 범위와 해석이 불확실한 원문은 null이다.",
        "예산은 단위가 확인된 값만 원으로 환산한다. 방문객 부분 집계는 합계로 간주하지 않는다.",
        "여러 행사 행에 걸쳐 병합된 방문객은 공동 집계일 수 있어 개별 행사 수치로 옮기지 않는다.",
        "문화예술→공연, 전통역사→전통, 생태자연·자연생태→꽃, 특산물→먹거리로 대분류한다.",
        "코로나 시기 및 취소 행사도 개최계획 모집단에 보존한다. 개최 사실·학습 적합성을 뜻하지 않는다.",
        "",
        "## 연도별 행 수",
        "",
        "| 연도 | 행 수 | 300행 기준 |",
        "|---|---:|---|",
    ]
    lines += [
        f"| {year} | {counts.get(year, 0)} | {'통과' if counts.get(year, 0) >= 300 else '미달'} |"
        for year in range(2017, 2027)
    ]
    lines += [
        "",
        "## 연도별 예산·개최 달 채움률",
        "",
        "| 연도 | 예산 채움 수 | 예산 채움률 | planned_month 채움 수 | planned_month 채움률 |",
        "|---|---:|---:|---:|---:|",
    ]
    lines += [
        f"| {year} | {budget} | {budget / total:.2%} | {month} | {month / total:.2%} |"
        for year, total, budget, month, _ in coverage
    ]
    # 시작일과 종료일이 모두 있는 비율로 1회차 기준 충족 여부를 표시한다.
    baselines = {2023: 0.45, 2024: 0.45, 2025: 0.59}
    lines += [
        "",
        "## 연도별 날짜 채움률",
        "",
        "날짜 채움률 = 시작일·종료일이 모두 있는 행 수 / 해당 연도 전체 행 수.",
        "1회차 기준은 재검토 지시의 2023년 45%·2024년 45%·2025년 59%다.",
        "",
        "| 연도 | 날짜 채움 수 | 날짜 채움률 | 1회차 기준 | 기준 충족 |",
        "|---|---:|---:|---:|---|",
    ]
    for year, total, _, _, complete in coverage:
        baseline = baselines.get(year)
        reference = f"{baseline:.2%}" if baseline is not None else "—"
        outcome = ("통과" if complete / total >= baseline else "미달") if baseline is not None else "—"
        lines.append(f"| {year} | {complete} | {complete / total:.2%} | {reference} | {outcome} |")
    lines += ["", "## 필수 출력 열 결측률", "", "| 열 | 결측 수 | 결측률 |", "|---|---:|---:|"]
    for name in FESTIVAL_DTYPES:
        missing = frame[name].null_count()
        lines.append(f"| {name} | {missing} | {missing / max(frame.height, 1):.2%} |")
    normalized = pl.col("type_raw").str.replace_all(r"\s+", "").str.replace(r"^[\d.·ㅇ_]+", "")
    unknown = frame.filter(~normalized.is_in(TYPE_MAPPING.keys()).fill_null(False))
    unknown = unknown.group_by("type_raw").len().sort("type_raw")
    lines += ["", "## 매핑 못 한 유형", "", "| 원문 유형 | 행 수 |", "|---|---:|"]
    lines += [f"| {(raw or '(결측)').replace('|', '/')} | {count} |" for raw, count in unknown.iter_rows()]
    return "\n".join(lines) + "\n"
