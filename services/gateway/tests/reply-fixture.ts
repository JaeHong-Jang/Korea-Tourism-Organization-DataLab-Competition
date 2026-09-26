// 기존 플레이북 단언에서 최종 대화 단계만 분리하고 원본 스트림은 순서 검사에 유지한다
import type { SseEvent } from "@crowdcast/contracts/types";
import type { Call } from "./team-fixture.js";

// 생성 스키마로 reply를 구별해 분류·해설 호출 수 검증을 계속 독립적으로 유지한다
export function isReplyCall(call: Call) {
  return (
    call.url.pathname === "/api/chat" &&
    Boolean(
      (call.body as { format?: { properties?: { text?: unknown } } })?.format
        ?.properties?.text,
    )
  );
}

// 고정 위치를 검사하는 기존 단언에만 쓰며 seq와 전체 스트림 자체는 바꾸지 않는다
export function withoutReplyEvents(events: SseEvent[]) {
  const ids = new Set(
    events
      .filter(
        (event) =>
          event.event === "agent_step" &&
          (event.data as { inputSummary: string }).inputSummary ===
            "결과 안내를 준비해요.",
      )
      .map((event) => (event.data as { stepId: string }).stepId),
  );
  return events.filter(
    (event) =>
      event.event !== "reply" &&
      !ids.has((event.data as { stepId?: string }).stepId ?? ""),
  );
}

// SDK 응답 외피는 실제 로컬 클라이언트와 같게 만들어 네트워크 없이 생성 경로를 시험한다
export function replyResponse(text: string) {
  return Response.json({
    message: { role: "assistant", content: JSON.stringify({ text }) },
    done: true,
    done_reason: "stop",
    load_duration: 0,
    eval_count: 20,
  });
}
