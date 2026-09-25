"""가짜 Ollama로 자리표시자 검증·대체 경로·과거 실행 보강과 단계 결과 보존을 확인한다."""

import json
from copy import deepcopy
from pathlib import Path

import httpx
import polars as pl
import pytest
from crowdcast import paths
from crowdcast.pipeline import __main__ as cli
from crowdcast.pipeline import run_record, stages, summary
from crowdcast.pipeline.summary_facts import facts


# 실제 장소 자료의 행 수와 버전을 포함한 완료 기록을 만든다.
@pytest.fixture
def completed(pipeline_root: Path) -> dict:
    record = run_record.new_record(stages.STAGES, ("fetch",), False)
    record["stages"][0].update(status="passed", gate={"passed": True, "message": "방문자 수집 12행"})
    record["stages"][0]["artifacts"] = run_record.artifacts([paths.PROCESSED / "region_daily.parquet"])
    record["stages"][-1]["gate"]["message"] = "사용 모델 v0.1.0(verdict=미검증)"
    run_record.finish_record(record, False, ("fetch",))
    run_record.write_record(record)
    return record


# 자리표시자 밖 숫자·미등록 토큰·빠진 토큰·손상 괄호는 모두 결정적 요약으로 대체한다.
@pytest.mark.parametrize("suffix", [" 999명", " １２명", " ²명", " {{n99999}}", " {n1}"])
def test_invalid_numbers_fall_back(completed: dict, monkeypatch: pytest.MonkeyPatch, suffix: str) -> None:
    monkeypatch.setattr(summary, "ollama_summary", lambda lines: " ".join(lines) + suffix)
    value = summary.generate_summary(completed)
    assert value == summary.generate_summary(completed, use_ollama=False)
    assert "12행" in value and "v0.1.0" in value and "{{" not in value


# 통신 실패에는 오류 본문을 남기지 않으며 템플릿의 사실을 보존한다.
def test_ollama_unavailable_uses_template(completed: dict, monkeypatch: pytest.MonkeyPatch) -> None:
    # 실제 네트워크를 열지 않고 연결 거부만 재현한다.
    def unavailable(lines: list[str]) -> str:
        raise httpx.ConnectError("Ollama 연결 불가")

    monkeypatch.setattr(summary, "ollama_summary", unavailable)
    assert summary.generate_summary(completed) == summary.generate_summary(completed, use_ollama=False)


# 실제 HTTP 직렬화 경로에도 가짜 전송만 연결해 모델 환경 변수·스키마·치환을 확인한다.
def test_fake_ollama_fills_placeholders(completed: dict, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OLLAMA_HOST", "127.0.0.1:11434")
    monkeypatch.setenv("OLLAMA_MODEL_FAST", "test-local-model")
    real_client = httpx.Client

    # 모델에는 숫자 원문이 빠진 사실 목록만 도착해야 한다.
    def reply(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content)
        assert str(request.url) == "http://127.0.0.1:11434/api/chat"
        assert payload["model"] == "test-local-model" and payload["stream"] is False
        lines = json.loads(payload["messages"][1]["content"])
        assert "12행" not in " ".join(lines) and "v0.1.0" not in " ".join(lines)
        return httpx.Response(
            200,
            json={
                "done": True,
                "message": {"content": json.dumps({"summary": "확인된 기록: " + " ".join(lines)})},
            },
        )

    monkeypatch.setattr(
        summary.httpx, "Client", lambda **kwargs: real_client(transport=httpx.MockTransport(reply), **kwargs)
    )
    value = summary.generate_summary(completed)
    assert value.startswith("확인된 기록:") and "12행" in value and "v0.1.0" in value
    assert "{{" not in value and "\n" not in value


# 요약만 다시 써도 종료 시각·단계·해시와 최신 실행 포인터는 바뀌지 않는다.
def test_summary_cli_preserves_execution_and_latest(completed: dict, monkeypatch: pytest.MonkeyPatch) -> None:
    newer = run_record.new_record(stages.STAGES, ("fetch",), False)
    run_record.write_record(newer)
    pointer = (paths.REPORTS / "runs/latest.json").read_bytes()
    monkeypatch.setattr(summary, "ollama_summary", lambda lines: "확인: " + " ".join(lines))
    assert cli.main(["summary", completed["runId"]]) == 0
    after = run_record.read_record(completed["runId"])
    assert after["summary"].startswith("확인:")
    assert {key: value for key, value in after.items() if key != "summary"} == {
        key: value for key, value in completed.items() if key != "summary"
    }
    assert (paths.REPORTS / "runs/latest.json").read_bytes() == pointer
    assert cli.main(["summary", newer["runId"]]) == 1
    assert cli.main(["summary", "../outside"]) == 1


# 과거 해시와 달라진 현재 행 수는 요약에 섞지 않는다.
def test_changed_artifact_does_not_rewrite_history(completed: dict) -> None:
    pl.DataFrame({"date": [None] * 999}).write_parquet(paths.PROCESSED / "region_daily.parquet")
    value = " ".join(facts(completed))
    assert "변경으로 실행 당시 추가 사실 확인 불가" in value and "999" not in value


# publish 뒤 요약 생성 자체가 깨져도 이미 완료한 파이프라인의 성공 코드를 유지한다.
def test_summary_failure_does_not_change_pipeline(
    pipeline_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(cli, "run_stage", lambda *args: {"passed": True, "message": "완료"})

    # 사실 조립 오류도 요약 단계 안에서만 격리한다.
    def fail(*args: object, **kwargs: object) -> str:
        raise RuntimeError("요약 실패")

    monkeypatch.setattr(summary, "generate_summary", fail)
    assert cli.main(["--from", "publish", "--to", "publish"]) == 0
    record = run_record.list_records()[0]
    assert record["status"] == "passed" and record["stages"][-1]["status"] == "passed"


# 요약 저장 오류는 호출자에게 알려주되 메모리의 기존 요약과 단계는 되돌린다.
def test_summary_save_error_is_isolated(completed: dict, monkeypatch: pytest.MonkeyPatch) -> None:
    before = deepcopy(completed)

    # 원본 기록을 건드리지 않고 쓰기 실패를 재현한다.
    def fail_write(*args: object, **kwargs: object) -> None:
        raise OSError("저장 불가")

    monkeypatch.setattr(run_record, "write_record", fail_write)
    assert not summary.save_summary(completed, use_ollama=False)
    assert completed == before


# 누락·반복 치환에서 미등록 숫자가 조용히 살아남지 않아야 한다.
@pytest.mark.parametrize("text", ["완료", "{{n2}}", "{{n1}}와 1", "{{n1}} {broken}", "{{n1}} {{n1}}"])
def test_placeholder_guard_rejects_missing_or_invented(text: str) -> None:
    with pytest.raises(ValueError, match="자리표시자"):
        summary.fill_summary(text, {"{{n1}}": "12"})


# 게이트의 분수는 경로로 가리지 않고 각 숫자를 결정적으로 복원한다.
def test_placeholder_fraction_is_not_a_local_path() -> None:
    assert summary.fill_summary("결측 {{n1}}/{{n2}}", {"{{n1}}": "0", "{{n2}}": "252"}) == "결측 0/252"


# 과거 기록 보강에서 로컬 경로는 요약에만 가리고 원래 게이트 메시지는 그대로 보존한다.
def test_summary_preserves_original_gate(completed: dict, monkeypatch: pytest.MonkeyPatch) -> None:
    message = f"입력: {paths.PROCESSED}/region_daily.parquet"
    completed["stages"][0]["gate"]["message"] = message
    run_record.write_record(completed)
    monkeypatch.setattr(summary, "ollama_summary", lambda lines: " ".join(lines))
    assert summary.summarize_run(completed["runId"])
    after = run_record.read_record(completed["runId"], public=False)
    assert after["stages"][0]["gate"]["message"] == message
    assert str(paths.PROCESSED) not in after["summary"]


# 행 수와 모델 버전은 현재 포인터가 아닌 실행 당시 해시가 같은 산출물에서 읽는다.
def test_summary_uses_recorded_rows_and_model(completed: dict) -> None:
    folder = paths.MODELS / "v0.1.0"
    folder.mkdir()
    card = folder / "model_card.json"
    card.write_text(json.dumps({"modelVersion": "v0.1.0"}))
    completed["stages"][0]["artifacts"].extend(run_record.artifacts([card]))
    count = pl.read_parquet(paths.PROCESSED / "region_daily.parquet").height
    value = summary.generate_summary(completed, use_ollama=False)
    assert f"region_daily.parquet 행 수 {count}." in value
    assert "기록 모델 버전 v0.1.0." in value
