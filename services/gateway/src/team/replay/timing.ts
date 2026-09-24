// 기록 시각으로 이벤트 간격을 계산하고 연결 종료 시 대기 타이머를 정리한다
import type { ReplayEvent } from "./validate-trace.js";

// 발표 중 LLM 대기 공백을 줄이는 유일한 변형으로 한 간격을 8초까지 재생한다
export const REPLAY_MAX_GAP_MS = 8_000;
export const REPLAY_DEFAULT_GAP_MS = 300;
export type ReplayWait = (ms: number, signal: AbortSignal) => Promise<void>;

// 어느 한쪽 시각이라도 없으면 옛 trace의 기본 간격으로 이어 붙인다
export function replayGap(previous: ReplayEvent, next: ReplayEvent) {
  if (previous.at === undefined || next.at === undefined)
    return REPLAY_DEFAULT_GAP_MS;
  return Math.min(
    REPLAY_MAX_GAP_MS,
    Math.max(0, Date.parse(next.at) - Date.parse(previous.at)),
  );
}

// 완료와 취소 양쪽에서 타이머와 구독을 해제하며 취소된 대기는 즉시 끝낸다
export const waitForReplay: ReplayWait = (ms, signal) => {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      resolve();
    };
    const cancel = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      reject(signal.reason);
    };
    const timer = setTimeout(finish, ms);
    signal.addEventListener("abort", cancel, { once: true });
  });
};
