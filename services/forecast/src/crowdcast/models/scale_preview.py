"""저장된 다가오는 행사와 같은 입력·기준일로 후보 등급 분포만 메모리에서 계산한다."""

import hashlib
import json
from collections import Counter
from datetime import date
from typing import Any

import polars as pl
from crowdcast import paths
from crowdcast.api.assemble.http import event_input
from crowdcast.api.assemble.observations import feature_frame
from crowdcast.data.events import contract_event
from crowdcast.features.announced import published_announced_daily
from crowdcast.models.baselines import SimpleModel
from crowdcast.models.distribution import distribution


# 개별 예보를 쓰거나 사용 모델 포인터를 바꾸지 않고 같은 행사 집합의 표만 반환한다.
def upcoming_distribution(
    candidate: SimpleModel,
    baseline: SimpleModel,
    events: dict[str, dict[str, Any]],
    names: list[str],
    config: dict[str, Any],
    basis: str,
) -> dict[str, Any]:
    stored = pl.read_parquet(paths.PROCESSED / "upcoming.parquet")
    forecasts = {
        row["forecast"]["id"]: row["forecast"]
        for line in (paths.PROCESSED / "upcoming_forecasts.jsonl").read_text(encoding="utf-8").splitlines()
        if (row := json.loads(line))
    }
    levels = {key: Counter() for key in ("stored", "baseline", "candidate")}
    sources, availability = Counter(), Counter()
    minima: dict[str, float] = {}
    baseline_bytes = hashlib.sha256()
    for item in stored.iter_rows(named=True):
        forecast = forecasts[item["forecastId"]]
        if forecast["eventId"] != item["eventId"]:
            raise ValueError("다가오는 행사 요약·예보 식별자 불일치")
        # 저장된 입력이 있으면 우선하고 이전 배치는 같은 마스터 행사로 복원한다.
        event = (
            json.loads(item["eventInput"])
            if item.get("eventInput")
            else event_input(contract_event(events[item["eventId"]]))
        )
        frame = feature_frame(event, date.fromisoformat(forecast["asOf"]), names)
        row = frame.row(0, named=True)
        sources[candidate.scale_source(row)] += 1
        availability["announced"] += int(row.get("visitors_announced") is not None)
        availability["dated"] += int(row.get("visitors_announced_available_at") is not None)
        availability["eligible"] += int(published_announced_daily(row) is not None)
        levels["stored"][str(item["level"])] += 1
        # 같은 환산 함수·난수·임계값을 적용하며 생성한 개별 예보는 저장하지 않는다.
        for name, model in (("baseline", baseline), ("candidate", candidate)):
            values = model.predict(frame)[0]
            if name == "baseline":
                baseline_bytes.update(item["eventId"].encode() + values.tobytes())
            peak, judgment = distribution(
                values, event, seed=config["seed"], n=config["samples"], basis=basis
            )
            levels[name][str(judgment.judgment["level"])] += 1
            median = peak.quantity("q-scale-preview")["p50"]
            minima[name] = min(minima.get(name, median), median)
    return {
        "n": stored.height,
        "levels": {
            key: {str(level): counts[str(level)] for level in range(1, 5)} for key, counts in levels.items()
        },
        "scaleSources": dict(sources),
        "announcementAvailability": dict(availability),
        "minPeakP50": minima,
        "baselinePredictionSha256": baseline_bytes.hexdigest(),
        "individualForecastsWritten": False,
    }
