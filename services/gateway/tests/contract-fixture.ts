// 계약 패키지의 실제 행사·예보·근거 픽스처를 테스트에서 공유한다
import { readFileSync } from "node:fs";
import { responseSchema } from "../src/contract/responses.js";

// 픽스처를 복제하지 않고 계약 저장소의 원본을 읽는다
export function readContractFixture(path: string): unknown {
  return JSON.parse(
    readFileSync(
      new URL(`../../../packages/contracts/fixtures/${path}`, import.meta.url),
      "utf8",
    ),
  );
}

// 생성 타입을 강제 단언하지 않고 검증한 영종 행사 카드를 요청 입력으로 쓴다
export function eventFixture() {
  const event = readContractFixture("event/valid-yeongjong.json");
  const validate = responseSchema("event");
  if (!validate(event)) throw new Error("행사 픽스처가 계약에 맞지 않습니다");
  return event;
}
