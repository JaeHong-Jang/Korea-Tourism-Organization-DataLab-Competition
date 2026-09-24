"""DIY 원본 열을 보존하는 입력 템플릿과 사람이 채운 골드B 라벨을 만든다."""

import csv
import io
from datetime import date
from pathlib import Path
from typing import Any

from crowdcast.labels.matching import EventMatcher
from crowdcast.labels.schema import flag, integer, label_row, number

DIY_COLUMNS = (
    "diy_daily_mean",
    "diy_total",
    "diy_days",
    "diy_area",
    "diy_checked_at",
    "diy_note",
    "diy_area_matches_venue",
)


# 모든 열을 문자열로 읽어 원본의 숫자 표기와 열 순서까지 유지한다.
def read_csv(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        fields = reader.fieldnames or []
        rows = list(reader)
    if (
        not fields
        or len(fields) != len(set(fields))
        or any(None in row or None in row.values() for row in rows)
    ):
        raise ValueError(f"DIY CSV 열 형식 오류: {path.name}")
    return fields, rows


# 재실행에서는 기존 수기 값을 원본 행 전체로 연결해 보존하고 새 대상만 빈칸으로 추가한다.
def prepare_template(targets: Path, template: Path) -> tuple[bytes, list[dict[str, str]]]:
    fields, targets_rows = read_csv(targets)
    if set(fields) & set(DIY_COLUMNS):
        raise ValueError("diy_targets.csv에는 수기 열을 추가하지 말고 템플릿을 사용하세요")
    original_keys = [tuple(row[field] for field in fields) for row in targets_rows]
    if len(set(original_keys)) != len(original_keys):
        raise ValueError("DIY 대상 원본 행 중복")
    saved = {}
    if template.exists():
        saved_fields, saved_rows = read_csv(template)
        if saved_fields not in (fields + list(DIY_COLUMNS), fields + list(DIY_COLUMNS[:-1])):
            raise ValueError("DIY 템플릿의 원본 열·순서 또는 수기 열이 변경됐습니다")
        for row in saved_rows:
            key = tuple(row[field] for field in fields)
            if key in saved or key not in original_keys:
                raise ValueError("DIY 템플릿의 원본 행이 수정·중복·제거됐습니다; 입력을 보존합니다")
            saved[key] = row

    # 작성된 수기 열을 덮어쓰지 않고 원본 대상 순서로만 출력한다.
    rows = [
        {**row, **{field: saved.get(key, {}).get(field, "") for field in DIY_COLUMNS}}
        for key, row in zip(original_keys, targets_rows, strict=True)
    ]
    buffer = io.StringIO(newline="")
    writer = csv.DictWriter(buffer, fieldnames=fields + list(DIY_COLUMNS), lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return buffer.getvalue().encode("utf-8-sig"), rows


# 숫자를 아직 채우지 않은 행은 건너뛰고 불완전한 입력은 QC에서 수정할 수 있게 남긴다.
def build_gold_b(
    rows: list[dict[str, str]],
    source: str,
    matcher: EventMatcher,
    unmatched: list[dict[str, Any]],
    skipped: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    labels = []
    for position, raw in enumerate(rows, 2):
        mean, total = number(raw["diy_daily_mean"]), number(raw["diy_total"])
        if mean is None and total is None:
            continue
        if not raw["diy_checked_at"].strip():
            skipped.append(
                {
                    "source_row": position,
                    "festival_name": raw["festival_name"],
                    "reason": "diy_checked_at 필요",
                }
            )
            continue
        if mean is None and not raw["diy_days"].strip():
            skipped.append(
                {
                    "source_row": position,
                    "festival_name": raw["festival_name"],
                    "reason": "diy_total 입력 시 diy_days 필요",
                }
            )
            continue
        event = matcher.match(
            raw["festival_name"], integer(raw["year"]), raw["sido"], source, position, unmatched
        )
        if event is None:
            continue
        labels.append(parse_row(raw, event, source, position, mean, total))
    return labels


# 직접 입력한 일평균을 우선하고 총원만 있으면 명시된 DIY 일수로 나눈다.
def parse_row(
    raw: dict[str, str],
    event: dict[str, Any],
    source: str,
    position: int,
    mean: float | None,
    total: float | None,
) -> dict[str, Any]:
    days = integer(raw["diy_days"] or raw["days"])
    if days <= 0:
        raise ValueError(f"DIY 기간은 양수여야 합니다: {source}:{position}")
    method = "diy_daily_mean 직접 입력" if mean is not None else "diy_total / diy_days"
    daily = mean if mean is not None else total / days
    row = label_row(event, "goldB", source, str(position))
    area_matches = raw.get("diy_area_matches_venue", "").strip()
    if area_matches not in {"", "예", "아니오"}:
        raise ValueError("diy_area_matches_venue는 예/아니오 또는 빈칸이어야 합니다")
    row.update(
        daily_mean=daily,
        total=total if total is not None else daily * days,
        days=days,
        method=f"{method}; 기간={'diy_days' if raw['diy_days'] else '대상 days'}; "
        f"총원={'diy_total' if total is not None else '일평균×일수'}; "
        f"영역={raw['diy_area']}; 행사장 일치={area_matches}; "
        f"확인일={raw['diy_checked_at']}; 메모={raw['diy_note']}",
        spatial_scope="행사장" if area_matches == "예" else "지정영역",
    )
    if not raw["diy_area"].strip():
        flag(row, "diy_area_missing")
    checked = date.fromisoformat(raw["diy_checked_at"])
    if checked.isoformat() != raw["diy_checked_at"]:
        raise ValueError("diy_checked_at은 YYYY-MM-DD 형식이어야 합니다")
    if row["available_at"] is not None:
        row["available_at"] = max(row["available_at"], checked)
    if event["end"] and checked < event["end"]:
        flag(row, "diy_checked_before_end")
    if total is not None and (total <= 0 or abs(daily - total / days) > abs(total / days) * 0.01):
        flag(row, "mean_total_mismatch_gt_1pct")
    if event["start"] and event["end"] and (event["end"] - event["start"]).days + 1 != days:
        flag(row, "event_days_mismatch")
    return row
