"""일괄 예보와 개최계획서 규모 환산의 등급 분포를 구분해 제공한다."""

from collections import Counter
from typing import Any

from crowdcast.analytics.insights.evidence import data_evidence, forecast_evidence, insight
from crowdcast.analytics.insights.i2_diagnostics import prediction_patterns
from crowdcast.analytics.insights.i2_model_review import model_review
from crowdcast.analytics.insights.i2_people import forecast_people
from crowdcast.analytics.insights.i2_scale import daily_scale
from crowdcast.analytics.insights.records import PLANS, Inputs, number
from crowdcast.api.assemble.evidence import fragment
from crowdcast.models.baselines import announced_daily
from crowdcast.rules.judge import judge
from crowdcast.rules.peak import sample_peak


# 계약 행사에 필요한 일정·위험 정보만 옮겨 기존 환산·판정 함수를 그대로 쓴다.
def rule_event(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["event_id"],
        "type": row["type"],
        "startsAt": f"{row['start']}T00:00:00+09:00",
        "endsAt": f"{row['end']}T23:59:59+09:00",
        "hazards": row.get("hazard_flags") or [],
        "timeOfDay": row.get("time_of_day"),
    }


# 확률 분포의 표본수와 전년 발표치 대용 표본수를 별도로 공개한다.
def calculate(inputs: Inputs) -> dict[str, Any]:
    events = inputs.event_index()
    model: Counter[int] = Counter()
    host: Counter[int] = Counter()
    rows, host_rows, assumptions = [], [], {}
    for forecast in inputs.forecasts:
        row = events.get(forecast["eventId"])
        if row is None:
            raise ValueError("일괄 예보의 행사가 마스터에 없습니다")
        rows.append(row)
        level = forecast["judgment"]["level"]
        if level not in (1, 2, 3, 4):
            raise ValueError("일괄 예보 등급 오류")
        model[level] += 1
        if (
            number(row.get("visitors_announced")) is None
            or not row.get("start")
            or not row.get("end")
            or row["end"] < row["start"]
        ):
            continue
        daily = announced_daily(
            {
                "visitors_announced": row["visitors_announced"],
                "duration": (row["end"] - row["start"]).days + 1,
            }
        )
        event = rule_event(row)
        peak = sample_peak([daily, daily, daily], event, seed=206)
        host[judge(peak.samples, event).judgment["level"]] += 1
        host_rows.append(row)
        for assumption in peak.assumptions:
            cases = assumptions.setdefault(assumption["id"], {})
            cases[assumption["value"], assumption["low"], assumption["high"]] = assumption
    size, host_size = len(rows), len(host_rows)
    # 예보 대상 일정과 별개로 저장 예보의 기준일·학습 기간·검증 상태를 보존한다.
    as_of = sorted({row["asOf"] for row in inputs.forecasts if row.get("asOf")})
    training = [
        row["predictionRun"]["trainRange"]
        for row in inputs.forecasts
        if row.get("predictionRun", {}).get("trainRange")
    ]
    verdicts = Counter(
        row.get("predictionRun", {}).get("modelVerdict") or "확인 필요" for row in inputs.forecasts
    )
    share = model[2] / size if size else 0
    series = [
        {"label": f"{name} · {level}등급", "value": counts[level]}
        for name, counts in (("모델 예보", model), ("주최측 발표 환산(전년 규모 대용)", host))
        for level in range(1, 5)
    ]
    people = forecast_people(inputs.forecasts, events)
    scale = daily_scale(people)
    content = {
        "forecastPeople": people,
        "dailyScale": scale,
        "modelExperiment": model_review(),
        "modelSampleSize": size,
        "hostProxySampleSize": host_size,
        "missingHost": size - host_size,
        "modelLevels": dict(model),
        "hostProxyLevels": dict(host),
        "seed": 206,
        "note": "개최계획서 전년 발표 누적/당해 기간을 규모 대용치로 환산; 올해 사전 예상치 아님",
        "forecastIds": [row["id"] for row in inputs.forecasts],
        "forecastAsOfPeriod": {"from": as_of[0], "to": as_of[-1]} if as_of else None,
        "modelTrainingPeriod": {
            "from": min(row["from"] for row in training),
            "to": max(row["to"] for row in training),
        }
        if len(training) == size and size
        else None,
        "modelVerdictCounts": dict(verdicts),
        "predictionDiagnostics": prediction_patterns(inputs.forecasts, events),
    }
    evidence = [
        data_evidence(inputs, PLANS, rows, content, input_name="events"),
        *forecast_evidence(inputs),
        *[
            fragment(
                "assumption",
                next(iter(cases.values()))["name"],
                {
                    "cases": list(cases.values()),
                    "seed": 206,
                    "note": "개최 일정별 피크일 계수·유형별 체류시간 범위에서 환산 표본 생성",
                },
                assumptionId=assumption_id,
            )
            for assumption_id, cases in sorted(assumptions.items())
        ],
    ]
    text = (
        f"모델 경계선(2등급) {model[2]}/{size}건; 4등급 {model[4]}/{size}건. "
        + (
            "현재 모델은 4등급에 편중되어 경계선 비중 해석에 한계가 있습니다. "
            if size and model[4] / size >= 0.5
            else ""
        )
        + f"주최측 발표 환산 {host_size}건은 전년 규모 대용치이며 올해 사전 예상치가 아닙니다. 추정 산식 기반"
        + (
            f" 검증되지 않은 모델의 예보 {verdicts['미검증']}건은 정확도가 확인된 결과로 해석할 수 없습니다."
            if verdicts["미검증"]
            else ""
        )
    )
    return insight(
        inputs, "I2", "1,000명 경계선 행사 비중", share, "비율", text, rows, series, evidence, pairs=host_size
    )
