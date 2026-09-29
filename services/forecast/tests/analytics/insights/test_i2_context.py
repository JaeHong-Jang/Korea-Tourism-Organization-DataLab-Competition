"""예보 기준일·학습 기간·검증 상태를 행사 일정과 분리해 보존한다."""
import json

from crowdcast.analytics.insights import i2
from crowdcast.analytics.insights.records import Inputs


# 새 설명 정보는 저장 예보의 등급이나 전년 환산 분포를 바꾸지 않는다.
def test_forecast_context_does_not_change_distribution(inputs: Inputs) -> None:
    before = i2.calculate(inputs)
    for forecast in inputs.forecasts:
        forecast["asOf"] = "2025-06-20"
        forecast["predictionRun"] = {
            "modelVerdict": "미검증",
            "trainRange": {"from": "2018-01-01", "to": "2023-12-31"},
        }
    result = i2.calculate(inputs)
    content = json.loads(result["evidence"][0]["summary"])
    assert result["series"] == before["series"]
    assert result["period"] == before["period"]
    assert content["forecastAsOfPeriod"] == {"from": "2025-06-20", "to": "2025-06-20"}
    assert content["modelTrainingPeriod"] == {"from": "2018-01-01", "to": "2023-12-31"}
    assert content["modelVerdictCounts"] == {"미검증": len(inputs.forecasts)}
    assert "정확도가 확인된 결과로 해석할 수 없습니다" in result["headline"]["text"]
