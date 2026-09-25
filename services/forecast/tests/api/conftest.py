"""API 테스트의 격리 자료와 네트워크 차단을 제공한다."""

import json
import socket
from collections.abc import Iterator
from datetime import date, timedelta
from pathlib import Path

import polars as pl
import pytest
from crowdcast import paths
from crowdcast.api.app import app
from crowdcast.api.assemble import inputs
from fastapi.testclient import TestClient


# 계약의 $ref와 health가 외부 연결 없이 동작하는지 보장한다.
@pytest.fixture(autouse=True)
def block_network(monkeypatch: pytest.MonkeyPatch) -> None:
    # 예상하지 못한 접속은 대상 주소를 출력하지 않고 실패시킨다.
    def deny_connection(*args: object, **kwargs: object) -> None:
        raise AssertionError("API 테스트에서는 실제 네트워크 접속을 허용하지 않습니다.")

    # DNS 조회와 직접 소켓 접속도 함께 막는다.
    monkeypatch.setattr(socket, "getaddrinfo", deny_connection)
    monkeypatch.setattr(socket, "create_connection", deny_connection)
    monkeypatch.setattr(socket.socket, "connect", deny_connection)
    monkeypatch.setattr(socket.socket, "connect_ex", deny_connection)


# 모든 새 라우트 테스트는 공유 산출물 대신 격리된 전처리 자료를 사용한다.
@pytest.fixture
def api_data(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    processed = tmp_path / "data/processed"
    processed.mkdir(parents=True)
    monkeypatch.setattr(paths, "DATA_ROOT", tmp_path)
    monkeypatch.setattr(paths, "PROCESSED", processed)
    monkeypatch.setattr(paths, "MODELS", tmp_path / "models")
    monkeypatch.setattr(inputs, "today", lambda: date(2026, 9, 25))
    inputs._table.cache_clear()
    return tmp_path


# 계약의 영종 행사 원문을 매 테스트 새 객체로 읽는다.
@pytest.fixture
def event() -> dict:
    path = paths.REPO_ROOT / "packages/contracts/fixtures/event/valid-yeongjong.json"
    return json.loads(path.read_text(encoding="utf-8"))


# 실제 ASGI 라우트를 통과하되 내부 예외는 HTTP 응답으로 확인한다.
@pytest.fixture
def client(api_data: Path) -> Iterator[TestClient]:
    with TestClient(app, raise_server_exceptions=False) as instance:
        yield instance


# 평시는 매일 세 집단과 공개일을 가진 녹화형 소형 자료로 재현한다.
@pytest.fixture
def region_data(api_data: Path) -> pl.DataFrame:
    rows = [
        {
            "sigungu_code": code,
            "sigungu_name": name,
            "date": date(2025, 8, 1) + timedelta(days=offset),
            "tou_div": group,
            "visitors": count + offset,
            "available_at": date(2025, 8, 2) + timedelta(days=offset),
            "continuity_break": False,
        }
        for code, name in (("28110", "인천 중구"), ("11110", "서울 종로구"))
        for offset in range(90)
        for group, count in (("현지인", 100.0), ("외지인", 200.0), ("외국인", 30.0))
    ]
    frame = pl.DataFrame(rows)
    frame.write_parquet(paths.PROCESSED / "region_daily.parquet")
    return frame


# 골든·미공개·비대표 라벨을 섞어 검색의 제외 규칙을 검증한다.
@pytest.fixture
def case_data(api_data: Path) -> tuple[list[dict], list[dict]]:
    events, labels = [], []
    for index in range(8):
        event_id = f"e-yeongjong-fireworks-{2017 + index}"
        start = date(2017 + index, 10, 19)
        events.append(
            {
                "event_id": event_id,
                "name": "영종 씨사이드파크 불꽃축제",
                "year": start.year,
                "start": start,
                "end": start,
                "sigungu_code": "28110",
                "sigungu_name": "인천 중구",
                "type": "불꽃",
                "is_golden": index == 0,
                "visitors_announced": 50000,
            }
        )
        labels.append(
            {
                "event_id": event_id,
                "label_tier": "goldA",
                "daily_mean": 15200.0 + index,
                "available_at": date(2026, 1, 1) if index == 1 else start + timedelta(days=180),
                "is_primary": index != 2,
                "is_golden": False,
                "usable_for_training": True,
                "time_unit": "일",
                "spatial_scope": "행사장",
                "kind": "사후 집계",
                "definition": "일평균",
                "method": "일평균 방문자수 원문",
                "source_file": "영종_연도별_방문자_추이.csv",
                "source_row": str(index + 2),
                "quality_flag": "ok",
            }
        )
    pl.DataFrame(events).write_parquet(paths.PROCESSED / "events.parquet")
    pl.DataFrame(labels).write_parquet(paths.PROCESSED / "labels.parquet")
    return events, labels


# 발행본 두 개와 서로 다른 후보·사용 포인터로 latest 선택을 검증한다.
@pytest.fixture
def model_data(api_data: Path) -> Path:
    root = api_data / "reports/backtest"
    root.mkdir(parents=True)
    template = json.loads(
        (paths.REPO_ROOT / "packages/contracts/fixtures/model-card/valid-v0-1-0.json").read_text()
    )
    for version in ("v0.1.0", "v0.2.0"):
        folder = paths.MODELS / version
        folder.mkdir(parents=True)
        run_id = f"bt-{version}"
        card = {**template, "id": f"mr-{version}", "modelVersion": version, "backtestRunId": run_id}
        (folder / "model_card.json").write_text(json.dumps(card))
        report = root / run_id
        report.mkdir()
        backtest = {
            "runId": run_id,
            "modelRunId": card["id"],
            "modelVersion": version,
            "target": "일평균 방문객",
            "evalYears": [2025],
            "points": [],
            "golden": [],
            "metrics": {
                "mdape": 12.0,
                "coverage80": 0.8,
                "coverageN": 5,
                "judgmentRecall": None,
                "judgmentPrecision": None,
                "baselineDeltaPp": None,
                "comparablePairs": 0,
            },
        }
        (report / "backtest.json").write_text(json.dumps(backtest))
    for name, version in (("promoted", "v0.1.0"), ("latest", "v0.2.0")):
        (root / f"{name}.json").write_text(
            json.dumps(
                {
                    "runId": f"bt-{version}",
                    "modelVersion": version,
                    "verdict": "미검증",
                }
            )
        )
    return root


# 실제 직렬화 모델로 추론·복원·포인터 교체를 검사하며 운영 모델 파일은 쓰지 않는다.
@pytest.fixture
def forecast_data(model_data: Path, region_data: pl.DataFrame, case_data: tuple, event: dict) -> Path:
    from crowdcast.api.assemble.model import load_model
    from crowdcast.api.assemble.observations import feature_frame
    from crowdcast.models.baselines import SimpleModel
    from crowdcast.models.ood import fit_ood
    from crowdcast.models.train import fit_quantiles, save_quantiles

    # 생성기의 계보 표에서 피처 목록을 얻어 모델 피처 이름 변경도 따라간다.
    row = feature_frame(event, inputs.cutoff(event), []).row(0, named=True)
    names = [key.removesuffix("_is_observation") for key in row if key.endswith("_is_observation")]
    rows = [
        {
            **{name: float(index + 1) if row[name] is not None else None for name in names},
            "event_id": f"e-yeongjong-training-{index}",
            "daily_mean": 2000.0 + index * 500,
            "label_tier": "goldA",
        }
        for index in range(40)
    ]
    frame = pl.DataFrame(rows, schema_overrides=dict.fromkeys(names, pl.Float64))
    config = {
        "seed": 2026,
        "samples": 4000,
        "silver_weight": 0.5,
        "gold_weight": 1.0,
        "lightgbm": {"n_estimators": 5, "num_leaves": 7, "min_child_samples": 10},
    }
    models, encoding = fit_quantiles(frame, names, config)
    for version in ("v0.1.0", "v0.2.0"):
        folder = paths.MODELS / version
        save_quantiles(folder, models, encoding)
        card = json.loads((folder / "model_card.json").read_text())
        card["features"] = names
        documents = {
            "model_card": card,
            "g0": {"primary_model": "lightgbm", "basis": "확률"},
            "run": {"config": config, "model_version": version, "run_id": f"bt-{version}"},
            "calibration": {"correction_log": 0.2},
            "ood": fit_ood(frame, names),
            "simple": vars(SimpleModel().fit(frame)),
        }
        for name, value in documents.items():
            (folder / f"{name}.json").write_text(json.dumps(value))
    load_model.cache_clear()
    return model_data
