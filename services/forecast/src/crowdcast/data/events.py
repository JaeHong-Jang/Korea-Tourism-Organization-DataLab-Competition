"""문체부 행사와 TourAPI 보강을 결정적 ID의 마스터로 합치고 매핑 품질을 기록한다."""

import argparse
import hashlib
import json
import re
from collections import Counter
from datetime import date
from pathlib import Path

import pandera.polars as pa
import polars as pl

from crowdcast import paths
from crowdcast.data.admin_dict import build_admin, compact, normalize_sido, spatial_connection
from crowdcast.data.call_ledger import CallLimitReached, atomic_write
from crowdcast.data.datago_client import DataGoClient, DataGoError, safe_error
from crowdcast.data.festival_dates import (
    WINDOW_END,
    WINDOW_START,
    enrich_events,
    fetch_festivals,
    normalized_name,
)
from crowdcast.data.festival_dates import merge_duplicates as merge_duplicates
from crowdcast.data.geocode import Gazetteer

# 위험 조건은 일반 지명 속 '산'·'불' 한 글자가 아닌 명시된 활동만 근거로 삼는다.
HAZARD_KEYWORDS = {"폭죽": ("폭죽", "불꽃축제", "불꽃놀이", "불꽃쇼"),
                   "불": ("달집태우기", "쥐불놀이", "낙화놀이", "들불축제", "횃불"),
                   "산": ("등산", "산행", "등반", "산악"),
                   "수면": ("수상레저", "수상스키", "수상체험", "수상공연", "수상무대",
                          "뗏목", "카누", "카약", "래프팅", "요트", "보트", "조정")}
HAZARD_KEYWORDS.update({word: (word,) for word in (
    "가연성가스", "석유류", "차량진입", "단일출입구", "무대밀집", "야간조명부족")})
# 생태·자연 원 유형은 이름에 식물 경관 근거가 있을 때만 꽃으로 좁힌다.
FLOWER_KEYWORDS = ("꽃", "벚", "유채", "튤립", "장미", "국화", "철쭉", "매화", "연꽃", "코스모스",
                   "진달래", "수국", "해바라기", "라벤더", "천일홍", "억새", "갈대", "단풍", "동백",
                   "산수유", "핑크뮬리", "메밀", "구절초", "작약", "양귀비", "꽃무릇", "상사화",
                   "목련", "개나리", "복사", "배꽃", "이팝")
# 꽃이 식물을 뜻하지 않는 낱말은 꽃 근거를 찾기 전에 지운다.
NOT_FLOWER_WORDS = ("꽃게", "불꽃", "꽃동네", "눈꽃", "얼음꽃")
STRINGS = ("event_id name type time_of_day sido sigungu_code sigungu_name sigungu_text venue fee host_type "
           "date_text sigungu_match coord_source visitors_announced_meaning date_source date_available_at "
           "image_url image_copyright").split()
EVENT_DTYPES = {**dict.fromkeys(STRINGS, pl.String),
                **dict.fromkeys(("year", "edition", "budget_krw", "planned_month", "visitors_announced"),
                                pl.Int64),
                **dict.fromkeys(("start", "end", "start_mcst", "end_mcst"), pl.Date),
                "lat": pl.Float64, "lng": pl.Float64,
                "is_golden": pl.Boolean, "continuity_break": pl.Boolean,
                **dict.fromkeys(("hazard_flags", "source", "source_refs"), pl.List(pl.String))}


# 해시 입력의 경계를 명시하고 미확정 행정구역도 원문 지역으로 구별한다.
def event_id(
    name: str, year: int, code: str | None, region_text: str = "", *, planned_month: int | None = None,
    planned_day: date | None = None,
) -> str:
    parts = [normalized_name(name), code or compact(region_text), year]
    if planned_day is not None:
        parts.append(planned_day.strftime("%m%d"))
    elif planned_month is not None:
        parts.append(f"{planned_month:02d}")
    identity = json.dumps(parts, ensure_ascii=False)
    return f"e-{year}-{code or '00000'}-{hashlib.sha1(identity.encode()).hexdigest()[:10]}"


# 인천 개편 이후에 걸치는 일정·미정 일정만 기준선 연속성에서 제외한다.
def continuity_break(event: dict) -> bool:
    affected = event["sigungu_code"] in {"28110", "28140", "28260"} or bool(
        re.search(r"제물포구|영종구|서해구|검단구",
                  f"{event.get('sigungu_text') or ''} {event.get('venue') or ''}"))
    return affected and (event["end"] >= date(2026, 7, 1) if event["end"] else event["year"] >= 2026)


# 원본의 수치·단위 문구는 그대로 옮기고 모르는 시간대와 금액은 비워 둔다.
def make_event(raw: dict, gazetteer: Gazetteer) -> dict:
    region, match = gazetteer.resolve(raw.get("sigungu_name"), raw.get("sido"))
    if region is None and match != "ambiguous":
        candidates = gazetteer.candidates(raw.get("venue") or "", raw.get("sido"))
        if len(candidates) == 1:
            region, match = gazetteer.regions[candidates[0]["sigunguCode"]], "venue"
        elif candidates:
            match = "ambiguous"
    code = region["sigungu_code"] if region else None
    name, year = raw["festival_name"], raw["year"]
    sido = region["sido"] if region else normalize_sido(raw.get("sido")) or raw.get("sido")
    text = compact(" ".join(str(raw.get(field) or "") for field in ("festival_name", "venue", "type_raw")))
    edition = re.search(r"제\s*(\d+)\s*회", name)
    host = raw.get("host") or ""
    kind = raw.get("type") or "기타"
    # 원 유형의 번호 머리(예: "02. 자연생태")를 떼고 생태·자연이면 이름으로 꽃 여부를 가린다.
    if compact(re.sub(r"^\s*\d+\s*[.)]\s*", "", str(raw.get("type_raw") or ""))) in {"생태자연", "자연생태"}:
        plain = compact(name)
        for word in NOT_FLOWER_WORDS:
            plain = plain.replace(word, "")
        kind = "꽃" if any(word in plain for word in FLOWER_KEYWORDS) else "기타"
    event = dict.fromkeys(EVENT_DTYPES)
    event.update(event_id=event_id(name, year, code, f"{sido or ''}:{raw.get('sigungu_name') or ''}"),
                 name=name, year=year, edition=int(edition[1]) if edition else None,
                 type="불꽃" if "불꽃축제" in text or "불꽃놀이" in text else kind,
                 start=raw.get("start_date"), end=raw.get("end_date"),
                 start_mcst=raw.get("start_date"), end_mcst=raw.get("end_date"),
                 time_of_day="야간" if re.search(r"야행|야간", name) else None,
                 sido=sido, sigungu_code=code, sigungu_name=region["sigungu_name"] if region else None,
                 sigungu_text=raw.get("sigungu_name"), venue=raw.get("venue"),
                 lat=region["lat"] if region else None, lng=region["lng"] if region else None,
                 budget_krw=raw.get("budget_krw"), fee="미상",
                 host_type=("대학" if "대학교" in host else
                            "지자체" if re.search(r"시청|군청|구청", host) else "기타"),
                 hazard_flags=sorted(hazard for hazard, words in HAZARD_KEYWORDS.items()
                                     if any(word in text for word in words)), source=["문체부"],
                 source_refs=[f"문체부:{raw.get('source_file', '')}:"
                              f"{raw.get('source_sheet', '')}:{raw.get('source_row', '')}"],
                 is_golden=False, date_text=raw.get("date_text"), planned_month=raw.get("planned_month"),
                 sigungu_match=match, coord_source="centroid" if region else "none",
                 visitors_announced=raw.get("visitors_announced"),
                 visitors_announced_meaning=raw.get("visitors_announced_meaning"), date_source="문체부")
    event["continuity_break"] = continuity_break(event)
    return event


# ID·코드·날짜·좌표 범위는 표를 기록하기 전에 Pandera로 검사한다.
def validate_events(frame: pl.DataFrame) -> None:
    schema = pa.DataFrameSchema({
        "event_id": pa.Column(str, pa.Check.str_matches(r"^e-[a-z0-9][a-z0-9_.:-]{1,120}$"), unique=True),
        "sigungu_code": pa.Column(str, pa.Check.str_matches(r"^\d{5}$"), nullable=True),
        "sigungu_match": pa.Column(str, pa.Check.isin(
            ["exact", "alias", "parent", "venue", "tourapi", "ambiguous", "none"])),
        "lat": pa.Column(float, pa.Check.in_range(33, 39), nullable=True),
        "lng": pa.Column(float, pa.Check.in_range(124, 132), nullable=True),
    }, checks=[pa.Check(lambda data: data.lazyframe.select(
        (pl.col("end") >= pl.col("start")).fill_null(True)), name="date_order")])
    schema.validate(frame)


# 날짜·좌표가 있는 행을 투영하고 알려지지 않은 시간대는 계약의 미상으로 보존한다.
def contract_event(row: dict) -> dict:
    missing = [field for field in ("start", "end", "sigungu_code", "lat", "lng", "sido", "sigungu_name")
               if row[field] is None]
    if missing:
        raise ValueError("계약 필수값 미확정: " + ", ".join(missing))
    return {"id": row["event_id"], "name": row["name"], "type": row["type"],
            "startsAt": f"{row['start']}T00:00:00+09:00", "endsAt": f"{row['end']}T23:59:59+09:00",
            "timeOfDay": row["time_of_day"] or "미상",
            "venue": {"name": row["venue"] or "", "lat": row["lat"], "lng": row["lng"]},
            "sido": row["sido"], "sigunguCode": row["sigungu_code"], "sigunguName": row["sigungu_name"],
            "fee": row["fee"], "hostType": row["host_type"], "budgetKrw": row["budget_krw"],
            "edition": row["edition"], "promo": [], "hazards": row["hazard_flags"], "expectedByHost": None,
            "source": "문체부" if "문체부" in row["source"] else "TourAPI"}


# 월만 알려진 행사와 실제 시작일이 있는 행사를 같은 10월 모집단에서 비교한다.
def october_counts(events: list[dict]) -> tuple[int, int]:
    rows = [r for r in events if r["year"] == 2026 and
            ((r["start"].month == 10) if r["start"] else r["planned_month"] == 10)]
    return len(rows), sum(r["start"] is not None and r["end"] is not None for r in rows)


# 명시한 이전 산출물과 유형·위험·ID를 비교하고 대상 기간의 계약 변환 결측을 센다.
def revision_report(events: list[dict], previous: list[dict] | None) -> list[str]:
    lines = ["", "## 유형·위험 비교", "비교 전은 --comparison-file 지정 산출물; 미지정은 —.",
             "| 구분 | 값 | 전 | 후 |", "|---|---|---:|---:|"]
    for field, labels in (("type", ("불꽃", "공연", "대학", "먹거리", "꽃", "전통", "기타")),
                          ("hazard_flags", HAZARD_KEYWORDS)):
        counts = [Counter(value for row in rows for value in
                  ([row[field]] if field == "type" else row[field])) for rows in (previous or [], events)]
        lines += [f"| {field} | {label} | {counts[0][label] if previous is not None else '—'} | "
                  f"{counts[1][label]} |" for label in labels]
    if previous is not None:
        old, new = ({row["event_id"] for row in rows} for rows in (previous, events))
        lines += [f"ID 유지 {len(old & new)}개; 제거 {len(old - new)}개; 추가 {len(new - old)}개.",
                  "제거 ID: " + json.dumps(sorted(old - new)), "추가 ID: " + json.dumps(sorted(new - old))]
    # 사유 조합별로 세어 한 행사에 여러 결측이 있어도 제외 수를 중복 집계하지 않는다.
    window = [row for row in events if row["start"] and WINDOW_START <= row["start"] <= WINDOW_END]
    failures: Counter[str] = Counter()
    for row in window:
        try:
            contract_event(row)
        except ValueError as exc:
            failures[str(exc)] += 1
    lines += ["", "## 대상 기간 계약 변환", f"{WINDOW_START}~{WINDOW_END} 시작 {len(window)}건; "
              f"변환 {len(window) - sum(failures.values())}건; 미변환 {sum(failures.values())}건.",
              "시간대 null은 계약 v1.6의 미상으로 투영한다. 사유별 건수(결측 조합):",
              *[f"- {reason}: {count}건" for reason, count in sorted(failures.items())]]
    if previous is not None:
        legacy = sum(row["start"] is not None and WINDOW_START <= row["start"] <= WINDOW_END and
                     all(row[field] is not None for field in
                         ("end", "time_of_day", "sigungu_code", "lat", "lng")) for row in previous)
        lines.append(f"이전 산출물·시간대 null 거부 규칙: {legacy}건; "
                     f"현재 {len(window) - sum(failures.values())}건.")
    return lines


# 미확정·중복·보강 판단을 모두 남겨 채움률만으로 품질을 숨기지 않는다.
def quality_report(
    before: list[dict], events: list[dict], audit: list[dict], conflicts: list[str], status: str,
    merges: list[dict] | None = None, previous: list[dict] | None = None,
) -> str:
    merges = merges or []
    splits = [row for row in merges if row["occurrences"] > 1]
    lines = ["# 행사 마스터 QC", "", f"TourAPI 상태: {status}",
             f"문체부 병합 후 {len(before)}행; 최종 {len(events)}행.",
             f"중복 병합: {sum(row['input_rows'] - row['occurrences'] for row in merges)}행 감소; "
             f"회차 분리: {len(splits)}묶음 → {sum(row['occurrences'] for row in splits)}회차.",
             f"일정 충돌 보류: {sum(row['action'] == '보류: 일정 충돌' for row in audit)}건 "
             "(이번 실행 응답 기준; 미실행이면 충돌을 확인한 값이 아님).",
             "중심점은 행사장 좌표가 아닌 시군구 경계 중심의 추정 위치다.",
             "날짜 확정 수는 시작·종료 일자가 채워진 수이며 개최 확정 공고 여부를 뜻하지 않는다.",
             "time_of_day 미상은 null, fee 미상은 미상, host_type 분류 불명은 기타로 보존한다.",
             "문체부 발표 방문객과 의미 원문은 라벨이 아니며 단위·발표일을 추가 추정하지 않는다.",
             "", "| 연도 | 전체 | 코드 있음 | 채움률 |", "|---|---:|---:|---:|"]
    for year in sorted({r["year"] for r in events}):
        rows = [r for r in events if r["year"] == year]
        filled = sum(r["sigungu_code"] is not None for r in rows)
        lines.append(f"| {year} | {len(rows)} | {filled} | {filled / len(rows):.2%} |")
    recent = [r for r in events if 2023 <= r["year"] <= 2026]
    filled = sum(r["sigungu_code"] is not None for r in recent)
    if recent:
        lines.append(f"| 2023~2026 합계 | {len(recent)} | {filled} | {filled / len(recent):.2%} |")
    lines += ["", "2026-10 시작(월 계획 포함)·날짜 채움: "
              f"보강 전 {october_counts(before)}, 최종 {october_counts(events)}.",
              "보강 미실행이면 최종 수치는 보강 효과를 나타내지 않는다.", "", "## 매칭 규칙",
              "2026년 동일 코드·부모 시(코드 미정은 동일 시도)에서 이름 유사도 ≥0.92, 차점 간격 ≥0.08.",
              "일치=1.0; 미달·동점은 별도 TourAPI 행. ID는 보강 전후 유지. 점-다각형 불일치 좌표는 폐기.",
              "문체부 날짜는 빈 값만 보강; 같은 기간은 출처만 추가, 충돌은 양쪽 일정과 원문을 기록하고 보류.",
              "기간이 겹치면 합집합, 떨어지면 회차 분리; 분리 시에만 ID 해시에 시작 월(MM) 추가.",
              "같은 달 복수 회차는 MMDD 사용; 시작 미상이면 알려진 종료일, 모두 미상이면 00 사용.",
              "일부 날짜는 기간 안일 때만 병합; 밖이면 별도 회차와 병합 보류에 양쪽 원문 보존.",
              "날짜가 모두 미정인 행끼리는 병합하고 다른 회차가 하나뿐이면 그 회차에 합친다.",
              "시군구는 정식명·별칭·부모를 먼저 사용; 장소는 문체부 원본의 명시 행정명 대응만 사용.",
              "장소 후보는 모두 보존한다. 본청·도내 전체·복수 지역을 임의의 한 구로 채우지 않는다.",
              "장소 별칭은 원본의 구분자·괄호·읍면동리 단위로 분리; 일반 시설명 제외, 상충 코드는 모두 유지.",
              "TourAPI 시점·해시는 source_refs/date_available_at에 보존; 사용 시점 제한은 후속 단계 적용.",
              "", "## ambiguous · none"]
    for row in events:
        if row["sigungu_match"] in {"ambiguous", "none"}:
            fields = ("event_id", "name", "sido", "sigungu_text", "venue", "sigungu_match")
            lines.append(json.dumps({k: row[k] for k in fields}, ensure_ascii=False))
    lines += ["", "## 병합·회차 분리", *[json.dumps(r, ensure_ascii=False) for r in merges],
              "", "## 병합 보류", *[r for r in conflicts if r.startswith("병합 보류:")],
              "", "## 중복 충돌", *[r for r in conflicts if not r.startswith("병합 보류:")],
              "", "## 검토 필요",
              *[json.dumps(r, ensure_ascii=False) for r in audit if "검토 필요" in r.get("rule", "")],
              "", "## TourAPI 매칭 점수·일정 충돌",
              *[json.dumps(r, ensure_ascii=False) for r in audit]]
    return "\n".join(lines + revision_report(events, previous)) + "\n"


# 기본 실행은 보강을 시도하되 한도 차단 시 산출물에 명시하고 실패 종료한다.
def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--golden-file", type=Path, help="event_id 문자열 배열인 JSON 골든 목록")
    parser.add_argument("--install-spatial", action="store_true")
    parser.add_argument("--offline", action="store_true", help="TourAPI를 호출하지 않고 미실행으로 기록")
    parser.add_argument("--comparison-file", type=Path, help="QC에서 비교할 이전 events.parquet")
    args = parser.parse_args()
    previous = pl.read_parquet(args.comparison_file).to_dicts() if args.comparison_file else None
    if args.install_spatial:
        spatial_connection(install=True).close()
    raw = pl.read_parquet(paths.PROCESSED / "mcst_festivals.parquet")
    regions = (pl.scan_parquet(paths.PROCESSED / "region_daily.parquet")
               .select("sigungu_code", "sigungu_name", "code_system").unique().collect())
    admin = build_admin(regions, paths.EXTERNAL / "boundaries/sigungu.topo.json")
    gazetteer = Gazetteer(admin, raw)
    merges = []
    before, conflicts = merge_duplicates([make_event(row, gazetteer) for row in raw.to_dicts()], merges)
    events, audit, status, exit_code = before, [], "미실행 (--offline)", 0
    if not args.offline:
        try:
            with DataGoClient(max_calls=30) as client:
                items = fetch_festivals(client)
                events, audit = enrich_events(before, items, gazetteer)
                status = f"완료; 응답 {len(items)}건; 이번 실행 외부 호출 {client.ledger.calls}건"
        except (CallLimitReached, DataGoError) as exc:
            status, exit_code = f"BLOCKED: {safe_error(exc)}", 1
    events, extra_conflicts = merge_duplicates(events, merges)
    golden = set()
    if args.golden_file and args.golden_file.exists():
        ids = json.loads(args.golden_file.read_text(encoding="utf-8"))
        if not isinstance(ids, list) or any(not isinstance(value, str) for value in ids):
            raise ValueError("골든 목록은 event_id 문자열의 JSON 배열이어야 합니다")
        golden = set(ids)
    for row in events:
        row["is_golden"] = row["event_id"] in golden
    frame = pl.from_dicts(events, schema=EVENT_DTYPES)
    validate_events(frame)
    paths.PROCESSED.mkdir(parents=True, exist_ok=True)
    admin.write_parquet(paths.PROCESSED / "admin_dict.parquet")
    frame.write_parquet(paths.PROCESSED / "events.parquet")
    report = quality_report(before, events, audit, conflicts + extra_conflicts, status, merges, previous)
    atomic_write(paths.PROCESSED / "events_qc.md", report.encode())
    print(f"행사 {frame.height}행, 사전 {admin.height}개; TourAPI {status}")
    return exit_code


# 모듈 실행에서도 한도 차단을 성공으로 오인하지 않도록 종료 코드를 전달한다.
if __name__ == "__main__":
    raise SystemExit(main())
