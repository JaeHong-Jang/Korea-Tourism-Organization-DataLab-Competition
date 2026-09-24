"""전체 빌드의 재실행 해시·골든 제외·QC 및 검증 실패 시 미기록을 검증한다."""

import hashlib
import json
from datetime import date, timedelta
from pathlib import Path

import polars as pl
import pytest
from crowdcast.labels import __main__ as cli
from crowdcast.labels.gold_b import read_csv
from label_fixtures import diy_targets, festival, gold_files, visitors, write_csv

OUTPUTS = ("labels.parquet", "labels_qc.md", "diy_labels_template.csv", "labels_g0.json")


# 공유 산출물과 네트워크를 쓰지 않고 부호 게이트를 통과하는 작은 전체 입력을 만든다.
def prepare(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    data, processed = tmp_path / "data", tmp_path / "data" / "processed"
    processed.mkdir(parents=True)
    monkeypatch.setattr(cli.paths, "DATA", data)
    monkeypatch.setattr(cli.paths, "PROCESSED", processed)
    gold_files(data)
    diy_targets(processed / "diy_targets.csv")
    start = date(2025, 7, 14)
    events = [
        festival(),
        festival(event_id="e-2025-41800-연천율무", name="연천율무축제", start=start, end=start),
    ]
    pl.from_dicts(events).write_parquet(processed / "events.parquet")
    values = {start - timedelta(days=7 * week): 90 + 10 * week for week in range(1, 5)}
    values[start] = 200
    visitors(values).write_parquet(processed / "region_daily.parquet")
    return processed


# 첫 실행과 동일 입력 재실행의 네 파일 바이트가 모두 같아야 한다.
def test_end_to_end_determinism_and_qc(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    processed = prepare(tmp_path, monkeypatch)
    assert cli.main([]) == 0
    hashes = {name: hashlib.sha256((processed / name).read_bytes()).hexdigest() for name in OUTPUTS}
    assert cli.main([]) == 0
    assert hashes == {name: hashlib.sha256((processed / name).read_bytes()).hexdigest() for name in OUTPUTS}
    report = (processed / "labels_qc.md").read_text()
    assert "등급 × 연도" in report and "정의 일치 골드 고유 행사 수(골든 제외): 1건" in report
    assert "| all_negative | 0 | 1 | 0.00% | ≤ 40% | pass |" in report
    assert "첫 실행 — 비교 없음" in report
    audit = json.loads((processed / "labels_g0.json").read_text())
    assert audit["g0"]["gold_summary"]["gold_event_count"] == 1
    assert audit["g0"]["gold_summary"]["peak_ge_1000_count"] == 1
    assert "180일(가정)" in report and "미매칭 (5건)" in report
    assert "G0: 골드 1건 < 30" in report

    # 같은 템플릿을 채운 뒤 같은 명령만 다시 실행해 골드B가 대표가 되는지 확인한다.
    template = processed / "diy_labels_template.csv"
    fields, rows = read_csv(template)
    rows[0].update(
        diy_daily_mean="46631.25",
        diy_area="전곡리 축제 행사장",
        diy_checked_at="2025-06-01",
        diy_area_matches_venue="예",
    )
    write_csv(template, fields, rows)
    golden = tmp_path / "golden.json"
    golden.write_text(json.dumps([festival()["event_id"]]))
    assert cli.main(["--golden-file", str(golden)]) == 0
    labels = pl.read_parquet(processed / "labels.parquet")
    gold = labels.filter(pl.col("event_id") == festival()["event_id"])
    assert gold.height == 2 and gold["is_golden"].all() and not gold["usable_for_training"].any()
    assert gold.filter(pl.col("is_primary"))["label_tier"].to_list() == ["goldB"]
    assert "정의 일치 골드 고유 행사 수(골든 제외): 0건" in (processed / "labels_qc.md").read_text()
    audit = json.loads((processed / "labels_g0.json").read_text())
    assert audit["silver"]["signal_retention"]["status"] == "pass"
    after = {name: (processed / name).read_bytes() for name in OUTPUTS}
    assert cli.main(["--golden-file", str(golden)]) == 0
    assert after == {name: (processed / name).read_bytes() for name in OUTPUTS}


# 스키마 실패가 최초 실행의 파일 생성과 성공 산출물 덮어쓰기 모두를 막아야 한다.
@pytest.mark.parametrize("previous", [False, True])
def test_validation_failure_writes_nothing(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    previous: bool,
) -> None:
    processed = prepare(tmp_path, monkeypatch)
    if previous:
        assert cli.main([]) == 0
    before = {
        name: (processed / name).read_bytes() if (processed / name).exists() else None for name in OUTPUTS
    }
    original_merge = cli.merge_labels

    # 실제 Pandera 검증에 잘못된 골드 수치를 넣어 예외를 모킹하지 않는다.
    def invalid(*args: object) -> pl.DataFrame:
        frame = original_merge(*args)
        return frame.with_columns(
            pl.when(pl.col("label_tier") == "goldA")
            .then(-1.0)
            .otherwise(pl.col("daily_mean"))
            .alias("daily_mean")
        )

    monkeypatch.setattr(cli, "merge_labels", invalid)
    assert cli.main([]) == 1
    assert before == {
        name: (processed / name).read_bytes() if (processed / name).exists() else None for name in OUTPUTS
    }


# 잘못 지정한 골든 파일은 0건으로 간주하지 않고 명시적으로 실패한다.
def test_invalid_golden(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    processed = prepare(tmp_path, monkeypatch)
    assert cli.main(["--golden-file", str(tmp_path / "missing.json")]) == 1
    assert not (processed / "labels.parquet").exists()
    invalid = tmp_path / "invalid.json"
    invalid.write_text('{"event_id": "연천구석기축제"}')
    assert cli.main(["--golden-file", str(invalid)]) == 1


# 부호 검사 실패도 Pandera 실패처럼 템플릿을 포함한 모든 기존 파일을 보존한다.
@pytest.mark.parametrize("previous", [False, True])
@pytest.mark.parametrize("failure", ["negative", "zero_signal", "retention"])
def test_sign_gate_writes_nothing(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    previous: bool,
    failure: str,
) -> None:
    processed = prepare(tmp_path, monkeypatch)
    if previous or failure == "retention":
        assert cli.main([]) == 0
    if failure == "retention":
        audit = json.loads((processed / "labels_g0.json").read_text())
        audit["silver"]["significant_count"] = 2
        audit["snapshot_sha256"] = "직전 다른 입력"
        (processed / "labels_g0.json").write_text(json.dumps(audit))
    else:
        frame = pl.read_parquet(processed / "region_daily.parquet")
        frame = frame.with_columns(
            pl.when(pl.col("date") == date(2025, 7, 14))
            .then(pl.col("visitors") * (0.05 if failure == "negative" else 0.575))
            .otherwise(pl.col("visitors"))
            .alias("visitors")
        )
        frame.write_parquet(processed / "region_daily.parquet")
    before = {
        name: (processed / name).read_bytes() if (processed / name).exists() else None for name in OUTPUTS
    }
    assert cli.main([]) == 1
    assert before == {
        name: (processed / name).read_bytes() if (processed / name).exists() else None for name in OUTPUTS
    }
