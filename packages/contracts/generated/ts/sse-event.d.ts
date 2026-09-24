/* 자동 생성 — packages/contracts/schemas에서 npm run contracts:gen 으로 만든다. 직접 고치지 않는다 */

/**
 * 게이트웨이 → 웹 스트림. claim·evidence는 발행 뒤에만 나간다
 */
export type SseEvent = {
  [k: string]: unknown;
} & {
  event:
    "agent_status" | "event_card" | "ask" | "forecast" | "evidence" | "claim" | "gate" | "suggest" | "done" | "error";
  seq: number;
  data: unknown;
};
