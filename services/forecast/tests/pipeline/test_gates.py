"""관측 격자 결측률·신선도 경계·장부 한도와 저장 라벨 판정의 실패 조건을 검증한다."""

import hashlib
import json
from datetime import timedelta
from pathlib import Path

import polars as pl
import pytest
from crowdcast import paths
from crowdcast.pipeline import gates
from pipeline_fixtures import TODAY, region_frame


# 정확히 오늘-40은 통과하고 전날·미래 관측일은 실패해야 한다.
@pytest.mark.parametrize(("age", "passed"), [(40, True), (41, False), (-1, False)])
def test_freshness_boundary(pipeline_root: Path, age: int, passed: bool) -> None:
    region_frame(latest=TODAY - timedelta(days=age)).write_parquet(paths.PROCESSED / "region_daily.parquet")
    assert gates.fetch_gate(TODAY)["passed"] is passed


# 50칸에서 구분 하나만 없어도 결측 1칸이며 정확히 2%는 실패한다.
def test_grid_missingness_strict_boundary(pipeline_root: Path) -> None:
    path = paths.PROCESSED / "region_daily.parquet"
    region_frame(25).slice(1).write_parquet(path)
    gate = gates.fetch_gate(TODAY)
    assert gate["passed"] is False
    assert "1/50=2.000000%" in gate["message"]
    region_frame(26).slice(1).write_parquet(path)
    assert gates.fetch_gate(TODAY)["passed"] is True
    assert "1/52=" in gates.fetch_gate(TODAY)["message"]


# 한 지역의 날 전체가 없거나 수치가 null·NaN이면 행 수 대신 격자 결측으로 잡는다.
@pytest.mark.parametrize("kind", ["absent", "null", "nan", "duplicate"])
def test_incomplete_cells(pipeline_root: Path, kind: str) -> None:
    frame = region_frame()
    if kind == "absent":
        frame = frame.slice(3)
    elif kind == "duplicate":
        frame = pl.concat([frame, frame.head(1)])
    else:
        frame = (
            frame.with_row_index()
            .with_columns(
                pl.when(pl.col("index") == 0)
                .then(None if kind == "null" else float("nan"))
                .otherwise(pl.col("visitors"))
                .alias("visitors")
            )
            .drop("index")
        )
    frame.write_parquet(paths.PROCESSED / "region_daily.parquet")
    gate = gates.fetch_gate(TODAY)
    assert gate["passed"] is False
    assert "1/4=25.000000%" in gate["message"]


# 완료 체크포인트의 전체 누락 날짜도 분모에 남기며 손상된 체크포인트는 거부한다.
def test_checkpoint_dates_and_hash(pipeline_root: Path) -> None:
    path = paths.PROCESSED / "region_daily.parquet"
    progress = {
        "parquet_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "completed_dates": [(TODAY - timedelta(days=33)).isoformat()],
    }
    path.with_suffix(".progress.json").write_text(json.dumps(progress))
    gate = gates.fetch_gate(TODAY)
    assert gate["passed"] is False and "2/6=" in gate["message"]
    progress["parquet_sha256"] = "0" * 64
    path.with_suffix(".progress.json").write_text(json.dumps(progress))
    assert "해시 불일치" in gates.fetch_gate(TODAY)["message"]


# 여러 API를 합산하고 과거 날짜는 오늘 예산에 더하지 않는다.
@pytest.mark.parametrize(("visitors", "passed"), [(870, True), (871, False)])
def test_shared_ledger_limit(pipeline_root: Path, visitors: int, passed: bool) -> None:
    ledger = paths.CACHE / "datago/ledger.csv"
    ledger.parent.mkdir()
    ledger.write_text(
        f"date,api,calls\n2026-09-25,visitors,{visitors}\n2026-09-25,festivals,30\n2026-09-24,visitors,900\n"
    )
    assert gates.fetch_gate(TODAY)["passed"] is passed


# 손상된 장부를 없는 장부처럼 통과시키지 않는다.
def test_malformed_ledger(pipeline_root: Path) -> None:
    ledger = paths.CACHE / "datago/ledger.csv"
    ledger.parent.mkdir()
    ledger.write_text("date,calls\n2026-09-25,900\n")
    with pytest.raises(ValueError, match="장부"):
        gates.fetch_gate(TODAY)


# G0 simple·전체 음수 경고는 중단하지 않으며 T-103 실패 표시는 그대로 중단한다.
@pytest.mark.parametrize("key", ["significant_negative", "signal_retention", "invalid_snr_count"])
def test_labels_saved_checks(pipeline_root: Path, key: str) -> None:
    path = paths.PROCESSED / "labels_g0.json"
    audit = json.loads(path.read_bytes())
    audit["silver"]["all_negative"]["status"] = "warn"
    path.write_text(json.dumps(audit))
    assert gates.labels_gate()["passed"] is True
    if key == "invalid_snr_count":
        audit["silver"][key] = 1
    else:
        audit["silver"][key]["status"] = "fail"
    path.write_text(json.dumps(audit))
    assert gates.labels_gate()["passed"] is False


# 성공 판정 JSON이 다른 라벨 파일을 가리키면 재현 가능한 성공이 아니다.
def test_labels_hash_mismatch(pipeline_root: Path) -> None:
    (paths.PROCESSED / "labels.parquet").write_bytes(b"changed labels")
    assert gates.labels_gate() == {"passed": False, "message": "labels_g0.json과 labels.parquet 해시 불일치"}
