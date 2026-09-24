"""골든 목록과 한도 차단 상태가 실제 CLI 산출물에 그대로 반영되는지 검증한다."""

import json
from datetime import date
from pathlib import Path

import polars as pl
import pytest
from crowdcast.data import events, geocode
from crowdcast.data.call_ledger import CallLimitReached
from crowdcast.data.events import make_event
from event_fixtures import gazetteer_fixture, mcst_row, tour_item


# 테스트별 산출물 경로와 작은 입력만 사용해 실제 공유 데이터는 건드리지 않는다.
def prepare_cli(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> str:
    gazetteer = gazetteer_fixture(tmp_path)
    identity = make_event(mcst_row(), gazetteer)["event_id"]
    pl.from_dicts([mcst_row()]).write_parquet(tmp_path / "mcst_festivals.parquet")
    gazetteer.admin.select("sigungu_code", "sigungu_name", "code_system").write_parquet(
        tmp_path / "region_daily.parquet"
    )
    monkeypatch.setattr(events.paths, "PROCESSED", tmp_path)
    monkeypatch.setattr(events, "build_admin", lambda *args: gazetteer.admin)
    return identity


# 지정된 골든 ID는 중복 병합 이후 한 행에 표시하고 누락 목록이면 전부 false로 남긴다.
def test_golden_file_and_offline_output(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    identity = prepare_cli(tmp_path, monkeypatch)
    golden = tmp_path / "golden.json"
    golden.write_text(json.dumps([identity]))
    monkeypatch.setattr("sys.argv", ["events", "--offline", "--golden-file", str(golden)])
    assert events.main() == 0
    assert pl.read_parquet(tmp_path / "events.parquet")["is_golden"].to_list() == [True]
    golden.unlink()
    assert events.main() == 0
    assert pl.read_parquet(tmp_path / "events.parquet")["is_golden"].to_list() == [False]
    assert "미실행" in (tmp_path / "events_qc.md").read_text()


# 호출이 막히면 기본 마스터를 보존하면서 종료 코드와 QC 모두 실패를 나타낸다.
def test_call_limit_is_not_success(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    prepare_cli(tmp_path, monkeypatch)
    monkeypatch.setattr("sys.argv", ["events"])

    # 전송 전에 이미 소진된 예산을 재현하므로 네트워크 접근은 없다.
    def blocked(client: object) -> list[dict]:
        raise CallLimitReached("한국 날짜 기준 공유 호출 한도 900건 도달")

    monkeypatch.setattr(events, "fetch_festivals", blocked)
    assert events.main() == 1
    assert "BLOCKED" in (tmp_path / "events_qc.md").read_text()
    assert pl.read_parquet(tmp_path / "events.parquet").height == 1


# 실제 CLI 보고서에도 병합·분리 건수와 합성 응답의 일정 충돌 양쪽을 남긴다.
def test_cli_merge_and_schedule_conflict_qc(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    prepare_cli(tmp_path, monkeypatch)
    rows = [mcst_row(start_date=date(2026, 10, 2), end_date=date(2026, 10, 4), source_row=i)
            for i in (3, 4)]
    rows += [mcst_row(festival_name="수원재즈페스티벌", planned_month=month,
                      start_date=date(2026, month, 1), end_date=date(2026, month, 2)) for month in (5, 10)]
    pl.from_dicts(rows).write_parquet(tmp_path / "mcst_festivals.parquet")
    monkeypatch.setattr("sys.argv", ["events", "--offline"])
    assert events.main() == 0
    report = (tmp_path / "events_qc.md").read_text()
    assert "중복 병합: 1행 감소; 회차 분리: 1묶음 → 2회차" in report
    assert "일정 충돌 보류: 0건" in report and "미실행 (--offline)" in report
    monkeypatch.setattr(events, "fetch_festivals", lambda client: [tour_item()])
    monkeypatch.setattr("sys.argv", ["events"])
    assert events.main() == 0
    report = (tmp_path / "events_qc.md").read_text()
    assert "일정 충돌 보류: 1건" in report and "이번 실행 외부 호출 0건" in report
    assert '"start_mcst": "2026-10-02"' in report and '"tourapi_start": "2026-10-09"' in report
    frame = pl.read_parquet(tmp_path / "events.parquet")
    assert frame.height == 3 and "start_mcst" in frame.columns and "end_mcst" in frame.columns


# 명시한 이전 산출물의 분류와 계약 변환 결측 사유를 오프라인 QC에 함께 기록한다.
def test_cli_revision_counts_and_contract_reasons(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    prepare_cli(tmp_path, monkeypatch)
    rows = [mcst_row(festival_name="동강뗏목축제", type="꽃", type_raw="생태자연",
                     start_date=date(2026, 10, 2), end_date=date(2026, 10, 4)),
            mcst_row(festival_name="수원재즈페스티벌", start_date=date(2026, 10, 5))]
    pl.from_dicts(rows).write_parquet(tmp_path / "mcst_festivals.parquet")
    monkeypatch.setattr("sys.argv", ["events", "--offline"])
    assert events.main() == 0
    baseline = pl.read_parquet(tmp_path / "events.parquet")
    baseline.with_columns(pl.lit("꽃").alias("type")).write_parquet(tmp_path / "previous.parquet")
    monkeypatch.setattr("sys.argv", ["events", "--offline", "--comparison-file",
                                     str(tmp_path / "previous.parquet")])
    assert events.main() == 0
    report = (tmp_path / "events_qc.md").read_text()
    assert "| type | 꽃 | 2 | 0 |" in report and "| hazard_flags | 수면 | 1 | 1 |" in report
    assert "ID 유지 2개; 제거 0개; 추가 0개" in report
    assert "시작 2건; 변환 1건; 미변환 1건" in report and "계약 필수값 미확정: end: 1건" in report
    assert pl.read_parquet(tmp_path / "events.parquet").equals(baseline)


# 사전에 없던 장소도 이미 검증한 TourAPI 행사 좌표가 있으면 공개 후보에 포함한다.
def test_tourapi_only_geocode_candidate(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    gazetteer = gazetteer_fixture(tmp_path)
    monkeypatch.setattr(geocode.paths, "PROCESSED", tmp_path)
    monkeypatch.setattr(geocode, "default_gazetteer", lambda: gazetteer)
    pl.from_dicts(
        [
            {
                "venue": "수원화성문화제 행사장",
                "sigungu_code": "41115",
                "lat": 37.27,
                "lng": 127.01,
                "coord_source": "tourapi",
            }
        ]
    ).write_parquet(tmp_path / "events.parquet")
    result = geocode.candidates("수원화성문화제 행사장", "경기")
    assert len(result) == 1 and result[0]["lat"] == 37.27 and result[0]["sigunguCode"] == "41115"
    assert geocode.candidates("수원화성문화제 행사장", "서울") == []
