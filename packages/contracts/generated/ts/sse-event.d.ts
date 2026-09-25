/* 자동 생성 — packages/contracts/schemas에서 npm run contracts:gen 으로 만든다. 직접 고치지 않는다 */

/**
 * 게이트웨이 → 웹 스트림. forecast는 숫자 카드만, claim·evidence는 발행 뒤에만
 */
export type SseEvent = {
  [k: string]: unknown;
} & {
  event:
    | "agent_status"
    | "agent_step"
    | "event_card"
    | "ask"
    | "forecast"
    | "gate"
    | "claim"
    | "evidence"
    | "recommend"
    | "suggest"
    | "reply"
    | "done"
    | "error";
  seq: number;
  data: unknown;
};
