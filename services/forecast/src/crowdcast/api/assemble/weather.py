"""행사일 날씨와 표본 제한을 계약의 요인·데이터 근거·보정 가정으로 조립한다."""

from dataclasses import dataclass
from typing import Any

from crowdcast.api.assemble.evidence import fragment
from crowdcast.api.assemble.identity import identifier
from crowdcast.api.assemble.weather_lookup import event_weather
from crowdcast.data.weather import service
from crowdcast.data.weather.normalize import as_kst
from crowdcast.models.weather_adjust import Coefficient, select_coefficient
from crowdcast.rules.evidence import assumption_evidence


# 단기와 중기 모두 정본에 등록된 데이터셋 식별자로 게이트웨이가 검색할 수 있다.
def weather_evidence(weather: dict[str, Any], snapshot: dict[str, Any]) -> dict[str, Any]:
    middle = snapshot["product"].startswith("mid_")
    dataset = "15059468" if middle else "15084084"
    target = as_kst(weather["at"])
    return fragment(
        "data", "행사일 기상청 날씨",
        {"weather": weather, "product": snapshot["product"],
         "issuedAt": snapshot["issued_at"], "fetchedAt": snapshot["fetched_at"],
         "availableAt": snapshot["available_at"], "provenance": snapshot["evidence"],
         "record": service.select_record(snapshot, target)},
        source={
            "datasetId": f"ds-kma-{'mid' if middle else 'short'}-{dataset}",
            "title": "기상청 중기예보" if middle else "기상청 단기예보·초단기실황",
            "publisher": "기상청", "datalabMenu": None,
            "accessUrl": f"https://www.data.go.kr/data/{dataset}/openapi.do",
        },
        period={"from": target.date().isoformat(), "to": target.date().isoformat()},
        availableAt=as_kst(snapshot["available_at"]).date().isoformat(),
    )


# 값이 없는 요소는 생략하고 예보값의 단위와 비·눈 구분을 라벨 자체에 보존한다.
def weather_label(weather: dict[str, Any]) -> str:
    parts = []
    if weather["pop"] is not None:
        parts.append(f"강수확률 {weather['pop']}%")
    if weather["pty"] is not None:
        parts.append("강수 없음" if weather["pty"] == "없음" else weather["pty"])
    if weather["sky"] is not None:
        parts.append(weather["sky"])
    for key, title in (("temp", "기온"), ("tempMin", "최저기온"), ("tempMax", "최고기온")):
        if weather.get(key) is not None:
            parts.append(f"{title} {weather[key]:g}℃")
    return "행사일 " + "·".join(parts)


# 날씨를 학습 관측에 섞지 않고 요청 예보의 후처리와 근거 발행에만 넘긴다.
@dataclass(frozen=True)
class WeatherAdjustment:
    weather: dict[str, Any]
    evidence: list[dict[str, Any]]
    coefficient: Coefficient | None
    note: str
    available_at: str

    # 계수가 없는 경로에서는 곱셈도 하지 않아 원래 분위수의 수치를 보존한다.
    @property
    def multiplier(self) -> float:
        return self.coefficient.multiplier if self.coefficient else 1.0

    # 같은 날씨라도 적용한 계수·표본·출처가 달라지면 새 예보 식별자를 만든다.
    def identity(self) -> dict[str, Any]:
        return {"evidenceIds": [item["id"] for item in self.evidence],
                "coefficient": self.coefficient.model_dump(mode="json") if self.coefficient else None,
                "note": self.note}

    # 등록된 가정 식별자와 범위를 유지하면서 요청에 적용한 배수와 표본을 기록한다.
    def assumption(self) -> dict[str, Any]:
        coefficient = self.coefficient
        note = self.note
        if coefficient:
            note = (f"날씨 보정 추정 배수 {coefficient.multiplier:g}; "
                    f"우천 표본 {coefficient.sample_count}건·건조 표본 {coefficient.dry_sample_count}건; "
                    f"추정 기간 {coefficient.period_from}~{coefficient.period_to}; {coefficient.source}")
        return {"id": "as-weather-adjustment", "name": "날씨 보정 배수", "value": self.multiplier,
                "low": 0.5, "high": 1.2, "unit": "배", "basis": "추정" if coefficient else "가정",
                "note": note}

    # 요인 라벨을 그대로 발행하며 강수확률을 인원 증감 기여도로 가장하지 않는다.
    def attach(self, forecast: dict[str, Any]) -> None:
        assumption = self.assumption()
        quantities = [forecast[key]["id"] for key in ("dailyMean", "peakConcurrent")]
        evidence = assumption_evidence(
            assumption, inputs=self.identity(), quantity_ids=quantities, forecast_id=forecast["id"],
        )
        forecast["assumptions"].append(assumption)
        forecast["evidence"].extend([*self.evidence, evidence])
        label = (f"과거 강수일 표본 기반 날씨 보정 추정 {self.multiplier:g}배"
                 if self.coefficient else f"{self.note} — 날씨 주의")
        labels = [
            ("event_weather", weather_label(self.weather), [item["id"] for item in self.evidence]),
            ("weather_adjustment", label, [evidence["id"], *[item["id"] for item in self.evidence]]),
        ]
        for feature, label, ids in labels:
            factor = {"feature": feature, "direction": "up" if self.multiplier > 1 else "down",
                      "contribution": 0.0, "label": label, "evidenceIds": ids}
            forecast["factors"].append({"id": identifier("fa", [forecast["id"], factor]), **factor})


# 조회·출처가 함께 확보된 경우에만 날씨 관련 응답을 추가한다.
def prepare_weather(event: dict[str, Any]) -> WeatherAdjustment | None:
    result = event_weather(event)
    if result is None:
        return None
    weather, snapshots = result
    coefficient, note = select_coefficient(event["type"], weather, as_of=service.now().date())
    return WeatherAdjustment(
        weather, [weather_evidence(weather, item) for item in snapshots],
        coefficient, note,
        max(as_kst(item["available_at"]) for item in snapshots).isoformat(),
    )
