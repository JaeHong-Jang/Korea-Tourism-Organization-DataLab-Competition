// 검증된 이벤트를 첫 프레임부터 원래 간격으로 보내며 trace 기록 경로는 호출하지 않는다
import type { SseEvent } from "@crowdcast/contracts/types";
import { type ReplayWait, replayGap, waitForReplay } from "./timing.js";
import type { ReplayEvent } from "./validate-trace.js";

// 대기 함수는 테스트에서 가짜 시계로 바꾸고 매 전송 직전 취소를 다시 확인한다
export async function playTrace(
  events: ReplayEvent[],
  write: (event: SseEvent) => Promise<void>,
  signal: AbortSignal,
  wait: ReplayWait = waitForReplay,
) {
  try {
    for (const [index, event] of events.entries()) {
      signal.throwIfAborted();
      if (index > 0) await wait(replayGap(events[index - 1], event), signal);
      signal.throwIfAborted();
      await write(event.envelope);
    }
  } catch (error) {
    if (!signal.aborted) throw error;
  }
}
