"""수집 일시 오류만 재시도하고 데이터 이상·예산·성공 시각은 실행 사이에 보존한다."""

import json
from datetime import datetime, timedelta
from pathlib import Path

import httpx
import pytest
from crowdcast import paths
from crowdcast.data.datago_client import ApiPage, DataGoClient, DataGoError, TransientDataGoError
from crowdcast.pipeline import __main__ as cli
from crowdcast.pipeline import run_record, stages
from pipeline_fixtures import TODAY, latest_record, region_frame


# 데이터 수집기의 두 겹 래핑과 HTTP 상태 분류에도 허용한 통신 오류만 재시도한다.
@pytest.mark.parametrize(
    ("failure", "retry"),
    [
        (TimeoutError("timeout"), True),
        (ConnectionError("연결 실패"), True),
        (httpx.ConnectError("연결 실패"), True),
        (TransientDataGoError("일시 오류"), True),
        (DataGoError("공공데이터 HTTP 429: 호출 한도 초과, 재시도 중단"), True),
        (ValueError("데이터 오류"), False),
        (DataGoError("필수 필드 오류"), False),
    ],
)
def test_wrapped_failure_retry(
    pipeline_root: Path, monkeypatch: pytest.MonkeyPatch, failure: Exception, retry: bool
) -> None:
    calls = []

    # 실제 방문자 수집기가 from None으로 감싸는 예외 구조를 재현한다.
    def collect(*args: object, **kwargs: object) -> None:
        calls.append(1)
        try:
            try:
                raise failure
            except Exception:
                raise DataGoError("페이지 실패") from None
        except DataGoError:
            raise DataGoError("수집 실패") from None

    # 재시도 소진 뒤에는 뒤 단계가 그대로 대기해야 한다.
    monkeypatch.setattr(stages, "collect_visitors", collect)
    assert cli.main(["--to", "labels"]) == 1
    assert len(calls) == (2 if retry else 1)
    assert latest_record(pipeline_root)["stages"][1]["status"] == "pending"


# HTTP 응답의 429·5xx만 재시도하고 인증·요청 오류는 바로 중단한다.
@pytest.mark.parametrize(
    ("status", "retry"), [(429, True), (500, True), (503, True), (400, False), (403, False)]
)
def test_http_status_retry(status: int, retry: bool) -> None:
    response = httpx.Response(status, request=httpx.Request("GET", "https://example.invalid"))
    failure = httpx.HTTPStatusError("HTTP 오류", request=response.request, response=response)
    assert cli.transient_error(failure) is retry


# 데이터 게이트와 행사 CLI 오류는 fetch 단계라도 두 번째 수집을 시작하지 않는다.
@pytest.mark.parametrize("failure", ["missing", "ledger", "events"])
def test_data_failure_never_retries(
    pipeline_root: Path, monkeypatch: pytest.MonkeyPatch, failure: str
) -> None:
    calls = []
    monkeypatch.setattr(stages, "collect_visitors", lambda *a, **kw: calls.append(1))
    monkeypatch.setattr(stages, "command", lambda *a: (1 if failure == "events" else 0, "행사 오류"))
    if failure == "missing":
        region_frame().slice(3).write_parquet(paths.PROCESSED / "region_daily.parquet")
    elif failure == "ledger":
        ledger = paths.CACHE / "datago/ledger.csv"
        ledger.parent.mkdir()
        ledger.write_text("date,api,calls\n2026-09-25,visitors,901\n")
    assert cli.main(["--to", "labels"]) == 1
    assert len(calls) == 1
    message = latest_record(pipeline_root)["stages"][0]["gate"]["message"]
    assert "시도 2:" not in message


# 직전 실행의 최신일보다 줄어들면 일시 오류가 동반돼도 재시도하지 않는다.
@pytest.mark.parametrize("timeout", [False, True])
def test_observation_regression_never_retries(
    pipeline_root: Path, monkeypatch: pytest.MonkeyPatch, timeout: bool
) -> None:
    previous = run_record.new_record(stages.STAGES, ("fetch",), False)
    previous["stages"][0].update(
        status="passed",
        gate={
            "passed": True,
            "message": run_record.FETCH_STATE_MARKER
            + json.dumps({"latest": "2026-08-25", "last_success": "2026-09-24T09:00:00+09:00"}),
        },
    )
    run_record.finish_record(previous, False, ("fetch",))
    run_record.write_record(previous)
    region_frame(latest=TODAY - timedelta(days=32)).write_parquet(paths.PROCESSED / "region_daily.parquet")
    calls = []

    # 이미 감소한 입력이어도 직전 실행 기록의 최신 관측일과 비교해야 한다.
    def collect(client: stages.VisitorClient, *args: object, **kwargs: object) -> None:
        calls.append(1)
        client.collected_rows = 12
        client.last_success = "2026-09-25T09:00:00+09:00"
        if timeout:
            raise TimeoutError("부분 수집 뒤 통신 오류")

    # 행사 명령까지 도달하지 않고 관측일 감소를 최우선 중단 사유로 남긴다.
    monkeypatch.setattr(stages, "collect_visitors", collect)
    monkeypatch.setattr(stages, "command", lambda *a: pytest.fail("감소 뒤 행사 실행"))
    assert cli.main(["--to", "labels"]) == 1
    record = latest_record(pipeline_root)
    assert len(calls) == 1 and "최신 관측일 감소" in record["stages"][0]["gate"]["message"]
    assert record["stages"][1]["status"] == "pending"


# 캐시 실행·dry 실행 뒤에도 마지막 실제 수집 성공 시각을 다음 실행이 이어받는다.
def test_last_collection_time_survives_cache_and_dry(
    pipeline_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    clients = []

    # 첫 실행만 새 응답을 수집하고 이후 실행은 같은 캐시를 사용한다.
    def collect(client: stages.VisitorClient, *args: object, **kwargs: object) -> None:
        clients.append(client)
        if len(clients) == 1:
            client.collected_rows = 12
            client.last_success = "2026-09-25T09:00:00+09:00"

    # dry가 latest를 가리켜도 실제 수집 기록 탐색은 이를 건너뛴다.
    monkeypatch.setattr(stages, "collect_visitors", collect)
    monkeypatch.setattr(stages, "command", lambda *a: (0, ""))
    assert cli.main(["--to", "labels", "--max-calls", "1"]) == 0
    assert cli.main(["--dry", "--to", "labels"]) == 0
    assert cli.main(["--to", "labels"]) == 0
    message = latest_record(pipeline_root)["stages"][0]["gate"]["message"]
    assert "캐시만" in message and "마지막 수집 성공 시각=2026-09-25T09:00:00+09:00" in message


# 새 응답만 성공 시각을 갱신하고 캐시·빈 응답·실패 호출은 수집 성공으로 세지 않는다.
@pytest.mark.parametrize("source", ["network", "cache", "empty", "failure"])
def test_collection_timestamp_tracks_response(
    pipeline_root: Path, monkeypatch: pytest.MonkeyPatch, source: str
) -> None:
    def page(client: DataGoClient, *args: object, **kwargs: object) -> ApiPage:
        if source != "cache":
            client.ledger.calls += 1
        if source == "failure":
            raise TimeoutError("응답 시간 초과")
        return ApiPage(
            [] if source == "empty" else [{"baseYmd": "20260825"}],
            1,
            1,
            1000,
            "a" * 64,
            datetime.fromisoformat("2026-09-25T00:00:00+00:00"),
        )

    # 기존 클라이언트의 반환값만 대체해 실제 전송 없이 기록 계층을 검증한다.
    monkeypatch.setattr(DataGoClient, "page", page)
    with stages.VisitorClient(cache_dir=paths.CACHE / "datago", max_calls=1) as client:
        if source == "failure":
            with pytest.raises(TimeoutError):
                client.page("visitors", {})
        else:
            client.page("visitors", {})
        assert client.collected_rows == (1 if source == "network" else 0)
        assert client.last_success == ("2026-09-25T09:00:00+09:00" if source == "network" else None)
