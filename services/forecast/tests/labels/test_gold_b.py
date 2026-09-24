"""DIY 템플릿 재실행에서 원본·수기 값 보존과 골드B 산식을 검증한다."""

from datetime import date, timedelta
from pathlib import Path

import pytest
from crowdcast.labels.gold_b import DIY_COLUMNS, build_gold_b, prepare_template, read_csv
from crowdcast.labels.matching import EventMatcher
from label_fixtures import diy_targets, festival, write_csv


# 원본 대상은 수정하지 않고 뒤에 붙인 열의 수기 값을 다음 실행에도 보존한다.
def test_template_roundtrip_and_new_targets(tmp_path: Path) -> None:
    source, template = tmp_path / "diy_targets.csv", tmp_path / "diy_labels_template.csv"
    original_fields = diy_targets(source)
    original = source.read_bytes()
    content, rows = prepare_template(source, template)
    template.write_bytes(content)
    assert list(rows[0]) == original_fields + list(DIY_COLUMNS)
    assert not build_gold_b(rows, template.name, EventMatcher([festival()]), [], [])
    fields, rows = read_csv(template)
    rows[0].update(
        diy_daily_mean="1,234.5",
        diy_area="전곡리 유적, 행사장",
        diy_checked_at="2025-06-01",
        diy_note="확인 완료\n원문 메모",
    )
    write_csv(template, fields, rows)
    roundtrip, recovered = prepare_template(source, template)
    assert roundtrip == template.read_bytes()
    assert source.read_bytes() == original
    label = build_gold_b(recovered, template.name, EventMatcher([festival()]), [], [])[0]
    assert (label["daily_mean"], label["total"], label["days"]) == (1234.5, 4938, 4)
    assert label["usable_for_training"] and "원문 메모" in label["method"]

    # 사람이 채운 기존 행은 그대로 두고 추가된 새 대상만 빈 수기 열로 만든다.
    _, targets = read_csv(source)
    targets.append({**targets[0], "priority": "2", "festival_name": "연천율무축제"})
    write_csv(source, original_fields, targets)
    _, expanded = prepare_template(source, template)
    assert expanded[0] == rows[0] and expanded[1]["diy_daily_mean"] == ""


# 직접 일평균과 총원 나눗셈 경로를 구별하고 누락된 DIY 일수를 추측하지 않는다.
def test_total_division_and_incomplete(tmp_path: Path) -> None:
    source = tmp_path / "diy_targets.csv"
    diy_targets(source)
    _, rows = prepare_template(source, tmp_path / "diy_labels_template.csv")
    rows[0].update(diy_total="4,000", diy_days="4", diy_area="전곡리 축제장", diy_checked_at="2025-06-01")
    matcher = EventMatcher([festival()])
    label = build_gold_b(rows, "processed/diy_labels_template.csv", matcher, [], [])[0]
    assert label["daily_mean"] == 1000 and "diy_total / diy_days" in label["method"]
    rows[0]["diy_daily_mean"] = "1001"
    assert build_gold_b(rows, "DIY.csv", matcher, [], [])[0]["daily_mean"] == 1001
    rows[0].update(diy_daily_mean="", diy_days="")
    skipped = []
    assert not build_gold_b(rows, "DIY.csv", matcher, [], skipped)
    assert len(skipped) == 1


# 바뀐 원본 행·열을 덮어써 수기 값을 잃는 대신 명확히 실패한다.
def test_template_edit_and_invalid_number(tmp_path: Path) -> None:
    source, template = tmp_path / "diy_targets.csv", tmp_path / "diy_labels_template.csv"
    diy_targets(source)
    content, rows = prepare_template(source, template)
    template.write_bytes(content)
    fields, rows = read_csv(template)
    rows[0]["year"] = "2024"
    write_csv(template, fields, rows)
    with pytest.raises(ValueError, match="원본 행"):
        prepare_template(source, template)
    rows[0]["diy_daily_mean"] = "NaN"
    with pytest.raises(ValueError, match="유한한"):
        build_gold_b(rows, template.name, EventMatcher([festival()]), [], [])


# 확인일 없이는 발행하지 않고 늦은 확인일이 다음 회차 피처 공개일을 앞당기지 못하게 한다.
@pytest.mark.parametrize("checked", ["", "2025-06-01", "2026-06-01"])
def test_checked_at_controls_availability(tmp_path: Path, checked: str) -> None:
    source = tmp_path / "diy_targets.csv"
    diy_targets(source)
    _, rows = prepare_template(source, tmp_path / "template.csv")
    rows[0].update(diy_daily_mean="1000", diy_area="전곡리 유적", diy_checked_at=checked)
    skipped = []
    labels = build_gold_b(rows, "DIY.csv", EventMatcher([festival()]), [], skipped)
    if not checked:
        assert not labels and skipped[0]["reason"] == "diy_checked_at 필요"
    else:
        assert labels[0]["available_at"] == max(
            festival()["end"] + timedelta(days=180), date.fromisoformat(checked)
        )


# 공간 일치가 명시된 행만 행사장 단위를 부여하며 빈칸·아니오는 라벨 자체를 버리지 않는다.
@pytest.mark.parametrize("matches,scope", [("예", "행사장"), ("아니오", "지정영역"), ("", "지정영역")])
def test_area_confirmation(tmp_path: Path, matches: str, scope: str) -> None:
    source = tmp_path / "diy_targets.csv"
    diy_targets(source)
    _, rows = prepare_template(source, tmp_path / "template.csv")
    rows[0].update(
        diy_daily_mean="1000",
        diy_area="전곡리 유적",
        diy_checked_at="2025-06-01",
        diy_area_matches_venue=matches,
    )
    label = build_gold_b(rows, "DIY.csv", EventMatcher([festival()]), [], [])[0]
    assert label["spatial_scope"] == scope and label["usable_for_training"]


# 이전 여섯 수기 열 템플릿에 입력된 숫자·메모를 잃지 않고 새 확인 열만 덧붙인다.
def test_migrate_legacy_template(tmp_path: Path) -> None:
    source, template = tmp_path / "diy_targets.csv", tmp_path / "diy_labels_template.csv"
    fields = diy_targets(source)
    _, rows = prepare_template(source, template)
    rows[0].pop("diy_area_matches_venue")
    rows[0].update(diy_daily_mean="1234", diy_note="검토한 원문")
    write_csv(template, fields + list(DIY_COLUMNS[:-1]), rows)
    _, recovered = prepare_template(source, template)
    assert recovered[0] == {**rows[0], "diy_area_matches_venue": ""}
