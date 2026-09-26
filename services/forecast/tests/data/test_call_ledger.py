"""공유 호출 장부의 날짜 경계·실행 예산·동시 예약·손상 시 중단을 검증한다."""

import csv
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

import pytest
from crowdcast.data import call_ledger
from crowdcast.data.call_ledger import CallLedger, CallLimitReached


# API가 달라도 하루 합계 900번째까지만 허용하고 다음 전송을 막는다.
def test_daily_budget_shared_between_apis(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(call_ledger, "korea_today", lambda: date(2026, 9, 25))
    path = tmp_path / "ledger.csv"
    path.write_text("date,api,calls\n2026-09-24,visitors,900\n2026-09-25,visitors,899\n")
    ledger = CallLedger(path)
    ledger.reserve("holidays")
    with pytest.raises(CallLimitReached, match="900"):
        CallLedger(path).reserve("concentration")
    assert ledger.calls == 1
    with path.open() as stream:
        assert sum(int(row["calls"]) for row in csv.DictReader(stream) if row["date"] == "2026-09-25") == 900


# 한국 날짜가 바뀌면 일 한도만 초기화되고 실행별 예산은 유지된다.
def test_korea_date_rollover_and_run_budget(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    today = date(2026, 9, 25)
    monkeypatch.setattr(call_ledger, "korea_today", lambda: today)
    ledger = CallLedger(tmp_path / "ledger.csv", max_calls=2)
    ledger.reserve("visitors")
    today = date(2026, 9, 26)
    ledger.reserve("holidays")
    with pytest.raises(CallLimitReached, match="max_calls"):
        ledger.reserve("places")
    assert "2026-09-25" in ledger.path.read_text() and "2026-09-26" in ledger.path.read_text()


# 독립된 클라이언트가 동시에 예약해도 남은 호출 한 건을 중복 소비하지 않는다.
def test_concurrent_reservations_do_not_exceed_limit(tmp_path: Path) -> None:
    path = tmp_path / "ledger.csv"
    path.write_text(f"date,api,calls\n{call_ledger.korea_today()},visitors,899\n")

    # 각 호출은 별도 장부 객체와 파일 설명자를 사용한다.
    def reserve(_: int) -> bool:
        try:
            CallLedger(path).reserve("holidays")
            return True
        except CallLimitReached:
            return False

    with ThreadPoolExecutor(max_workers=8) as pool:
        assert sum(pool.map(reserve, range(16))) == 1


# 손상된 장부를 새 장부로 덮어쓰지 않아 사용량 초기화를 막는다.
@pytest.mark.parametrize("content", ["", "date,api,calls\n2026-09-25,visitors,-1\n", "잘못된 장부"])
def test_corrupt_ledger_fails_closed(tmp_path: Path, content: str) -> None:
    path = tmp_path / "ledger.csv"
    path.write_text(content)
    with pytest.raises(RuntimeError, match="장부 형식"):
        CallLedger(path).reserve("visitors")
    assert path.read_text() == content


# 기상청 ASOS는 공유 한도가 찼어도 별도 900건 안에서 호출하고 공유 한도에는 더하지 않는다.
def test_asos_uses_separate_pool(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(call_ledger, "korea_today", lambda: date(2026, 9, 26))
    path = tmp_path / "ledger.csv"
    path.write_text("date,api,calls\n2026-09-26,asos,899\n2026-09-26,visitors,900\n")
    CallLedger(path).reserve("asos")
    with pytest.raises(CallLimitReached, match="asos 별도"):
        CallLedger(path).reserve("asos")
    with pytest.raises(CallLimitReached, match="공유"):
        CallLedger(path).reserve("holidays")
    path.write_text("date,api,calls\n2026-09-26,asos,900\n2026-09-26,visitors,10\n")
    CallLedger(path).reserve("holidays")
