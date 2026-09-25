// 자동 품질의 히스테리시스와 장면 대체 문구·저장 이름을 검증한다.
import { expect, test } from "vitest";
import { sceneFestivals as festivals } from "../__fixtures__/festivals";
import {
  type QualityWindow,
  recommendedQuality,
  type SceneQuality,
  sampleQuality,
  shiftQuality,
} from "../quality";
import { nationalDescription, venueDescription } from "../scene-description";

// 연속된 느린 구간만 강등하고 빠른 구간은 한 번만 복구한다.
test("자동 품질은 연속 저하와 한 번의 복구에만 반응한다", () => {
  const state: QualityWindow = {
    frames: 0,
    elapsed: 0,
    slow: 0,
    fast: 0,
    cooldownUntil: 0,
    recovered: false,
  };
  let quality: SceneQuality = "high";
  const feed = (frameMs: number, count: number, start: number) => {
    for (let index = 0; index < count; index++) {
      const step = sampleQuality(state, frameMs, start + (index + 1) * frameMs);
      if (step !== 0) quality = shiftQuality(quality, step);
    }
  };
  feed(45, 60, 0);
  expect(quality).toBe("high");
  feed(45, 60, 2700);
  expect(quality).toBe("medium");
  feed(14, 900, 10000);
  expect(quality).toBe("high");
});

// 브라우저 힌트 하나만 작아도 저사양 단계로 시작한다.
test("저사양 기기 힌트를 낮음 품질로 판정한다", () => {
  expect(recommendedQuality(4, 8)).toBe("low");
  expect(recommendedQuality(8, 4)).toBe("low");
  expect(recommendedQuality(8, 8)).toBe("high");
});

// 화면에 쓰는 예보값과 선택 행사만 음성 설명에 담는다.
test("전국·행사장 장면 설명에 표시 데이터와 시각을 넣는다", () => {
  const first = festivals[0];
  expect(nationalDescription(festivals, first.eventId)).toContain(
    `선택: ${first.name}`,
  );
  expect(nationalDescription(festivals, null)).toContain(
    `표시 행사 ${festivals.length}건`,
  );
  expect(venueDescription(216, 9, null)).toBe(
    "행사장 반경 약 1.2km · 건물 216동 · 시각 09:00 · 날씨 정보 없음",
  );
});
