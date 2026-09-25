"""네트워크 없이 단계 실행·게이트·호출 예산을 추적하는 가짜 입력을 제공한다."""

from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import polars as pl
from crowdcast import paths
from pipeline_fixtures import write_backtest


# 네트워크 자원 대신 호출 예산과 정리 여부만 추적한다.
class FakeVisitorClient:
    # 실제 클라이언트와 같은 수집 이력 필드를 제공한다.
    def __init__(self, *, max_calls: int) -> None:
        self.max_calls = max_calls
        self.ledger = SimpleNamespace(calls=0)
        self.collected_rows = 0
        self.last_success = None
        self.closed = False

    # fetch 재시도가 같은 클라이언트를 사용하는지 확인할 수 있게 자신을 넘긴다.
    def __enter__(self) -> "FakeVisitorClient":
        return self

    # 실패 경로에서도 연결 자원이 정리됐는지 표시한다.
    def __exit__(self, *exc: object) -> None:
        self.closed = True


# 게이트 실패·미검증·일시 장애를 주입하되 기록·승격·publish는 실제 코드를 사용한다.
@dataclass
class FakeStages:
    calls: list[str] = field(default_factory=list)
    verdicts: dict[str, bool | None] = field(default_factory=dict)
    errors: dict[str, list[Exception]] = field(default_factory=dict)
    clients: list[FakeVisitorClient] = field(default_factory=list)
    baselines: list[tuple[Any, str | None]] = field(default_factory=list)

    # 파일을 쓰는 단계만 대체하고 기존 호출 인자와 산출물 목록을 그대로 받는다.
    def execute(
        self,
        stage: str,
        today: date,
        client: FakeVisitorClient | None,
        files: list[Path],
        history: dict[str, str | None],
        baseline: tuple[Any, str | None],
    ) -> dict[str, Any]:
        self.calls.append(stage)
        self.baselines.append(baseline)
        if client is not None:
            self.clients.append(client)
        if self.errors.get(stage):
            raise self.errors[stage].pop(0)

        # 한국 행사 표본 두 행으로 행 수·해시를 확인하고 백테스트는 승격 입력도 만든다.
        if stage != "fetch":
            output = paths.PROCESSED / f"{stage}_dagster.parquet"
            pl.DataFrame({"festival": ["연천구석기축제", "강릉커피축제"]}).write_parquet(output)
            files.append(output)
        if stage == "backtest":
            files.append(write_backtest())
        return {"passed": self.verdicts.get(stage, True), "message": f"연천구석기축제 {stage} 게이트"}
