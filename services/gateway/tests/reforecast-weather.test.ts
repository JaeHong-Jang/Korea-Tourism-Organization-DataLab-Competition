// 날씨 보정 근거의 종류·데이터셋과 한국 날짜 기준 미적용 사유를 검사한다
import type { ReforecastResult } from "@crowdcast/contracts/types";
import { expect, it } from "vitest";
import { responseSchema } from "../src/contract/responses.js";
import { reforecastFixture } from "./reforecast-fixture.js";

// 새로운 기상청 근거만 적용 여부를 결정하고 해당 식별자를 반환한다
it.each(["data", "assumption"] as const)(
  "기상청 %s 근거가 있는 새 예보는 applied=true이다",
  async (kind) => {
    const harness = reforecastFixture({
      forecast: (forecast) => {
        const original = forecast.evidence.find((item) => item.kind === kind);
        if (!original) throw new Error("날씨 근거 테스트용 원본 없음");
        forecast.evidence.push({
          ...original,
          id: "ev-weather-yeongjong-2026",
          title: "영종 행사일 날씨 보정",
          source: {
            datasetId: "ds-kma-short-15084084",
            title: "기상청 단기예보",
            publisher: "기상청",
            datalabMenu: null,
            accessUrl: null,
          },
        });
        return forecast;
      },
    });
    const response = await harness.request();
    expect(response.status).toBe(200);
    const result: ReforecastResult = await response.json();
    expect(result.weather).toMatchObject({
      applied: true,
      evidenceIds: ["ev-weather-yeongjong-2026"],
    });
    expect(responseSchema("reforecast-result")(result)).toBe(true);
  },
);

// 문구만 날씨를 언급하거나 근거 종류가 모델이면 보정 적용이라고 단정하지 않는다
it.each(["다른 데이터셋", "모델 근거"])(
  "%s은 날씨 보정 근거로 인정하지 않는다",
  async (failure) => {
    const harness = reforecastFixture({
      forecast: (forecast) => {
        const found = forecast.evidence.find(
          (item) => item.kind === (failure === "모델 근거" ? "model" : "data"),
        );
        if (!found) throw new Error("날씨 근거 테스트용 원본 없음");
        // 평시 근거는 재예보 전에 그대로 적재되므로 바꾸지 않고, 새 id의 사본으로 문구만 날씨처럼 만든다
        const original = structuredClone(found);
        original.id = `${found.id}-weather-word`;
        forecast.evidence.push(original);
        original.title = "날씨 weather 보정";
        if (failure === "모델 근거")
          original.source = {
            datasetId: "ds-kma-mid-15059468",
            title: "기상청 중기예보",
            publisher: "기상청",
            datalabMenu: null,
            accessUrl: null,
          };
        return forecast;
      },
    });
    const response = await harness.request();
    expect(response.status).toBe(200);
    expect((await response.json()).weather).toMatchObject({
      applied: false,
      evidenceIds: [],
    });
  },
);

// 과거·예보 경계·가까운 행사의 근거 부재를 현재 한국 날짜로 구별한다
it.each([
  ["2026-09-24T19:00:00+09:00", "지난 행사"],
  ["2026-09-25T19:00:00+09:00", "날씨 없음 또는 보정 표본 부족"],
  ["2026-10-05T14:59:59Z", "날씨 없음 또는 보정 표본 부족"],
  ["2026-10-05T15:00:00Z", "10일"],
])("%s의 미적용 사유는 %s이다", async (startsAt, note) => {
  const harness = reforecastFixture();
  harness.event.startsAt = startsAt;
  harness.event.endsAt = new Date(
    Date.parse(startsAt) + 7_200_000,
  ).toISOString();
  const response = await harness.request();
  expect(response.status).toBe(200);
  const result: ReforecastResult = await response.json();
  expect(result.weather.applied).toBe(false);
  expect(result.weather.note).toContain(note);
});

// 이전 스냅샷의 보정 이력을 새 예보의 적용 근거로 가져오지 않는다
it("이전 스냅샷에만 날씨 근거가 있으면 새 결과는 applied=false이다", async () => {
  const harness = reforecastFixture({
    forecast: (forecast, attempt) => {
      if (attempt === 1) {
        // 적재된 평시 근거는 그대로 두고 기상청 데이터셋을 가리키는 새 근거 사본을 더한다
        const found = forecast.evidence.find((item) => item.kind === "data");
        if (found?.source) {
          const data = structuredClone(found);
          data.id = `${found.id}-kma`;
          if (data.source) data.source.datasetId = "ds-kma-mid-15059468";
          forecast.evidence.push(data);
        }
      }
      return forecast;
    },
  });
  expect((await harness.request()).status).toBe(200);
  const response = await harness.request();
  expect(response.status).toBe(200);
  expect((await response.json()).weather).toMatchObject({
    applied: false,
    evidenceIds: [],
  });
});
