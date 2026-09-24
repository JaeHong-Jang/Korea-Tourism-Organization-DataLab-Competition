"""G0의 세 갈래 경계와 실행 전 고정·덮어쓰기 금지를 검증한다."""

import json
from pathlib import Path

import polars as pl
import pytest
from crowdcast.labels.g0 import build_g0
from crowdcast.models.g0 import decide, freeze_g0, previous_version, read_g0, verify_qc


# 한 조건의 경계만 바꿔도 규칙에 지정된 모델·표시만 달라져야 한다.
@pytest.mark.parametrize(
    ("gold", "per_year", "below", "above", "branch", "basis"),
    [
        (29, 15, 10, 10, "simple", "구간"),
        (30, 15, 10, 10, "partial", "확률"),
        (59, 15, 10, 10, "partial", "확률"),
        (60, 15, 10, 10, "planned", "확률"),
        (60, 14, 10, 10, "partial", "확률"),
        (60, 15, 9, 10, "partial", "구간"),
        (60, 15, 10, 9, "partial", "구간"),
        (30, 15, 9, 10, "partial", "구간"),
    ],
)
def test_g0_boundaries(gold: int, per_year: int, below: int, above: int, branch: str, basis: str) -> None:
    qc = {
        "gold_summary": {
            "gold_event_count": gold,
            "peak_below_1000_count": below,
            "peak_ge_1000_count": above,
        },
        "gold_by_year": [{"year": year, "gold_event_count": per_year} for year in (2024, 2025)],
    }
    result = decide(qc, [2024, 2025])
    assert result["branch"] == branch
    assert result["basis"] == basis
    assert result["primary_model"] == ("simple" if gold < 30 else "lightgbm")


# 같은 버전의 결정은 덮어쓸 수 없고 QC 해시가 다른 스냅샷도 거부한다.
def test_g0_is_immutable(tmp_path: Path, label_qc: dict, input_hashes: dict) -> None:
    path = freeze_g0(tmp_path, label_qc, input_hashes, [2024, 2025], "v1-test")
    before = path.read_bytes()
    timestamp = path.stat().st_mtime_ns
    freeze_g0(tmp_path, label_qc, input_hashes, [2024, 2025], "v1-test")
    assert path.read_bytes() == before and path.stat().st_mtime_ns == timestamp
    with pytest.raises(ValueError, match="변경 금지"):
        freeze_g0(tmp_path, label_qc, input_hashes, [2025], "v1-test")
    with pytest.raises(ValueError, match="불일치"):
        freeze_g0(tmp_path, label_qc, {**input_hashes, "labels": "b" * 64}, [2024, 2025], "v1-test")
    changed = json.loads(before)
    changed["primary_model"] = "lightgbm"
    path.write_text(json.dumps(changed))
    with pytest.raises(ValueError, match="규칙 불일치"):
        read_g0(path, input_hashes)


# 세 입력 중 하나가 바뀌면 같은 버전의 사전 결정을 재사용·덮어쓰지 못한다.
@pytest.mark.parametrize("name", ["labels", "labels_g0", "events"])
def test_each_g0_input_change_stops(tmp_path: Path, label_qc: dict, input_hashes: dict, name: str) -> None:
    directory = tmp_path / "v1-test"
    path = freeze_g0(directory, label_qc, input_hashes, [2024, 2025], "v1-test")
    before = path.read_bytes()
    frozen = json.loads(before)
    assert frozen["input_sha256"] == {
        "labels.parquet": input_hashes["labels"],
        "labels_g0.json": input_hashes["labels_g0"],
        "events.parquet": input_hashes["events"],
    }
    changed = {**input_hashes, name: "f" * 64}
    for check in (
        lambda: read_g0(path, changed),
        lambda: freeze_g0(directory, label_qc, changed, [2024, 2025], "v1-test"),
    ):
        with pytest.raises(ValueError, match="입력이 바뀌었다 — T-103부터 다시"):
            check()
    assert path.read_bytes() == before


# QC의 G0 집계는 지금 labels·events로 다시 계산한 값과 같아야 하며 원본만 바뀐 QC는 거부한다.
def test_verify_qc_recomputes_from_inputs(model_data: tuple) -> None:
    frame, events = model_data
    labels = frame.with_columns(pl.lit(True).alias("is_primary"), pl.lit(True).alias("usable_for_training"))
    rows = list(events.values())
    qc = {"g0": json.loads(json.dumps(build_g0(labels, rows)))}
    verify_qc(qc, labels, rows)
    first_gold = labels.filter(pl.col("label_tier") == "goldA")["event_id"][0]
    dropped = labels.filter(pl.col("event_id") != first_gold)
    with pytest.raises(ValueError, match="다시 계산한 G0 집계가 QC와 다름"):
        verify_qc(qc, dropped, rows)
    moved = [
        {**row, "start": row["start"].replace(month=9)} if row["event_id"] == first_gold else row
        for row in rows
    ]
    if build_g0(labels, moved) != build_g0(labels, rows):
        with pytest.raises(ValueError, match="다시 계산한 G0 집계가 QC와 다름"):
            verify_qc(qc, labels, moved)


# 직전 버전과 달라진 입력은 기록만 하고, 포인터가 없으면 기록할 직전 버전도 없다.
def test_previous_version_records_changed_inputs(tmp_path: Path, input_hashes: dict) -> None:
    pointer = tmp_path / "latest.json"
    assert previous_version(tmp_path, input_hashes, pointer) is None
    (tmp_path / "v1-test").mkdir()
    (tmp_path / "v1-test" / "run.json").write_text(json.dumps({"input_hashes": input_hashes}))
    pointer.write_text(json.dumps({"modelVersion": "v1-test"}))
    assert previous_version(tmp_path, input_hashes, pointer) is None
    rebuilt = {**input_hashes, "labels": "c" * 64, "events": "e" * 64}
    assert previous_version(tmp_path, rebuilt, pointer) == {
        "modelVersion": "v1-test",
        "changedInputs": ["events", "labels"],
    }
