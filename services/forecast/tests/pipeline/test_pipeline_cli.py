"""단계 선택·중단·fetch 예산과 재시도·dry 무변경을 실제 실행 기록으로 검증한다."""

import json
from pathlib import Path

import pytest
from crowdcast import paths
from crowdcast.api.contract import validate
from crowdcast.data.call_ledger import CallLimitReached
from crowdcast.pipeline import __main__ as cli
from crowdcast.pipeline import stages
from pipeline_fixtures import latest_record, write_features, write_model


# 선택 범위와 없는 모듈을 구분하고 labels부터 실행할 때 fetch를 부르지 않는다.
def test_selection_and_missing_modules(pipeline_root: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = []
    monkeypatch.setattr(stages, "command", lambda entry, args=None: (calls.append(entry) or 0, ""))
    # T-203 병합 뒤에도 모듈이 없는 경로를 재현하려고 모델·일괄 예보 모듈 탐색을 가린다.
    find_spec = stages.importlib.util.find_spec
    hidden = {"crowdcast.models", "crowdcast.analytics.upcoming"}
    monkeypatch.setattr(
        stages.importlib.util, "find_spec", lambda name, *a: None if name in hidden else find_spec(name, *a)
    )
    assert cli.main(["--from", "labels", "--to", "batch"]) == 2
    record = latest_record(pipeline_root)
    assert [s["status"] for s in record["stages"]] == ["skipped", "passed", *(["skipped"] * 5)]
    assert calls == ["crowdcast.labels"]
    assert "진입점 없음" in record["stages"][2]["gate"]["message"]
    assert record["stages"][2]["gate"]["passed"] is None
    assert record["status"] == "failed"
    assert "미구현 단계: features, train, backtest, batch" in record["summary"]
    validate("pipeline-run", record)


# 잘못된 단계 범위·음수 호출 예산은 실행 기록도 만들지 않는다.
@pytest.mark.parametrize(
    "argv", [["--from", "labels", "--to", "fetch"], ["--max-calls", "-1"], ["--from", "unknown"]]
)
def test_invalid_arguments(pipeline_root: Path, argv: list[str]) -> None:
    with pytest.raises(SystemExit) as exc:
        cli.main(argv)
    assert exc.value.code == 2
    assert not (paths.REPORTS / "runs").exists()


# 유효한 과거 라벨 게이트가 있어도 이번 CLI 실패는 중단하고 뒤 단계는 대기로 남긴다.
def test_command_failure_stops_pending(pipeline_root: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = []
    monkeypatch.setattr(stages, "command", lambda entry, args=None: (calls.append(entry) or 7, "실버 실패"))
    assert cli.main(["--from", "labels"]) == 1
    record = latest_record(pipeline_root)
    assert record["status"] == "failed"
    assert [s["status"] for s in record["stages"]] == ["skipped", "failed", *(["pending"] * 5)]
    assert "종료 코드 7" in record["stages"][1]["gate"]["message"]
    assert calls == ["crowdcast.labels"]


# 모듈이 생기면 상수 표의 진입점을 실행하며 모듈 부재로 계속 건너뛰지 않는다.
def test_available_optional_module(pipeline_root: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = []

    # 명령 정상 종료에 더해 이번 실행의 피처 산출물을 실제로 작성한다.
    def command(entry: str, args: list[str] | None = None) -> tuple[int, str]:
        calls.append(entry)
        write_features()
        return 0, ""

    # 모듈 탐색만 대체하고 필수 산출물 검사는 실제 경로로 수행한다.
    monkeypatch.setattr(stages, "missing_entrypoint", lambda name: None)
    monkeypatch.setattr(stages, "command", command)
    assert cli.main(["--from", "features", "--to", "features"]) == 0
    assert calls == ["crowdcast.models:features"]
    assert latest_record(pipeline_root)["stages"][2]["status"] == "passed"


# 네트워크 실패의 두 번째 시도도 같은 client.ledger를 써서 예산을 다시 충전하지 않는다.
@pytest.mark.parametrize("recover", [True, False])
def test_fetch_retry_once_with_shared_budget(
    pipeline_root: Path,
    monkeypatch: pytest.MonkeyPatch,
    recover: bool,
) -> None:
    clients = []

    # 합성 전송도 장부 객체의 이번 실행 예산을 먼저 확인한다.
    def collect(client: object, *args: object, **kwargs: object) -> None:
        clients.append(client)
        if client.ledger.calls >= client.ledger.max_calls:
            raise CallLimitReached("이번 실행의 max_calls 한도 도달")
        client.ledger.calls += 1
        if not recover or len(clients) == 1:
            raise TimeoutError("응답 시간 초과")

    # 두 번의 게이트 검사가 같은 예산 객체를 공유하는지 기록까지 확인한다.
    monkeypatch.setattr(stages, "collect_visitors", collect)
    monkeypatch.setattr(stages, "command", lambda *args: (0, ""))
    assert cli.main(["--max-calls", "2", "--to", "labels"]) == (0 if recover else 1)
    assert len(clients) == 2 and clients[0] is clients[1]
    assert clients[0].ledger.calls == 2
    record = latest_record(pipeline_root)
    assert "시도 1:" in record["stages"][0]["gate"]["message"]
    assert "시도 2:" in record["stages"][0]["gate"]["message"]
    assert record["stages"][1]["status"] == ("passed" if recover else "pending")


# dry는 데이터·모델·캐시를 생성하거나 다시 쓰지 않으며 클라이언트도 만들지 않는다.
def test_dry_preserves_all_inputs_and_writes_only_records(
    pipeline_root: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # batch dry 검사는 사용 모델 포인터·카드를 입력으로 요구하므로 발행된 모델이 있는 상태에서 시작한다.
    write_model()
    before = {p: (p.read_bytes(), p.stat().st_mtime_ns) for p in pipeline_root.rglob("*") if p.is_file()}

    # dry에서 실행 경로에 도달하면 테스트 자체를 실패시킨다.
    def reject(*args: object, **kwargs: object) -> None:
        raise AssertionError("dry가 실행 코드를 호출했습니다")

    # 실행 경로를 막은 상태에서 dry 기록만 추가되고 입력은 보존돼야 한다.
    monkeypatch.setattr(stages, "VisitorClient", reject)
    monkeypatch.setattr(stages, "execute_stage", reject)
    assert cli.main(["--dry", "--max-calls", "800"]) == 2
    after = {p: (p.read_bytes(), p.stat().st_mtime_ns) for p in before}
    assert before == after
    added = {p for p in pipeline_root.rglob("*") if p.is_file()} - set(before)
    assert {p.name for p in added} == {"run.json", "run.md", "latest.json"}
    assert all(p.is_relative_to(paths.REPORTS / "runs") for p in added)
    record = latest_record(pipeline_root)
    assert record["runId"].startswith("dry-") and record["status"] == "failed"
    assert all(stage["artifacts"] == [] for stage in record["stages"])
    assert record["stages"][-1]["status"] == "skipped"


# dry에서도 필수 입력 결손은 실패하고 labels를 실행한 것처럼 넘어가지 않는다.
def test_dry_missing_input_stops(pipeline_root: Path) -> None:
    (paths.PROCESSED / "mcst_festivals.parquet").unlink()
    assert cli.main(["--dry"]) == 1
    record = latest_record(pipeline_root)
    assert record["stages"][0]["status"] == "failed"
    assert record["stages"][1]["status"] == "pending"


# 게이트 JSON 실패도 CLI 종료 코드 실패와 같은 중단 규칙을 따른다.
def test_saved_gate_failure_stops(pipeline_root: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    path = paths.PROCESSED / "labels_g0.json"
    audit = json.loads(path.read_bytes())
    audit["silver"]["signal_retention"]["status"] = "fail"
    path.write_text(json.dumps(audit))
    monkeypatch.setattr(stages, "command", lambda *args: (0, ""))
    assert cli.main(["--from", "labels"]) == 1
    assert latest_record(pipeline_root)["stages"][2]["status"] == "pending"
