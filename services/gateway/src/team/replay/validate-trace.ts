// JSONL 전체의 형식을 검사하고 첫 요청을 순번으로 정렬해 SSE 순서 규칙을 적용한다
// @ts-expect-error 계약의 SSE 순서 실행기는 JavaScript로 배포된다
import { sequenceProblems } from "@crowdcast/contracts/rules/sse-sequence.mjs";
import type { SseEvent } from "@crowdcast/contracts/types";
import { validateSseEvent } from "../runtime/events.js";
import { ReplayError } from "./replay-error.js";

export type ReplayEvent = { envelope: SseEvent; at?: string };
type TraceRow = ReplayEvent & { requestId: string };

// 손상 위치와 규칙만 알리고 trace의 자유 입력이나 JSON 원문은 반환하지 않는다
function invalid(message: string): never {
  throw new ReplayError("TRACE_INVALID", 422, message.replace(/[\r\n]+/g, " "));
}

// 새 기록의 UTC 밀리초 시각은 엄격히 검사하고 시각이 없는 옛 기록만 허용한다
function parseRow(line: string, index: number): TraceRow {
  let row: unknown;
  try {
    row = JSON.parse(line);
  } catch {
    return invalid(`${index + 1}행: JSON 형식 오류입니다.`);
  }
  if (!row || typeof row !== "object" || Array.isArray(row))
    return invalid(`${index + 1}행: trace 객체가 필요합니다.`);
  const { requestId, at, ...envelope } = row as Record<string, unknown>;
  if (typeof requestId !== "string" || !requestId.trim())
    return invalid(`${index + 1}행: requestId가 필요합니다.`);
  if (
    at !== undefined &&
    (typeof at !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(at) ||
      !Number.isFinite(Date.parse(at)) ||
      new Date(at).toISOString() !== at)
  )
    return invalid(`${index + 1}행: at은 UTC 밀리초 ISO 시각이어야 합니다.`);
  if (!validateSseEvent?.(envelope))
    return invalid(`${index + 1}행: SSE 이벤트 스키마 위반입니다.`);
  return {
    requestId,
    at: at as string | undefined,
    envelope: envelope as SseEvent,
  };
}

// 다른 요청은 전송하지 않되 모든 줄의 JSON·스키마 오류는 스트림 시작 전에 막는다
export function validateTrace(text: string): ReplayEvent[] {
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  if (!lines.length) return invalid("재생 파일이 비어 있습니다.");
  const rows = lines.map(parseRow);
  const selected = rows
    .filter((row) => row.requestId === rows[0].requestId)
    .sort((left, right) => left.envelope.seq - right.envelope.seq);
  const events = selected.map((row) => row.envelope);
  if (events.some((event, index) => event.seq !== index))
    return invalid("seq는 0부터 빈틈·중복 없이 이어져야 합니다.");
  const last = events.at(-1);
  if (last?.event !== "done")
    return invalid("마지막 이벤트가 done이 아닙니다.");

  // 기존 예보 id가 없는 종료와 새 예보 전용 이벤트는 오류·되묻기도 새 요청으로 검사한다
  const forecastId = (last.data as { forecastId: string | null }).forecastId;
  const isNew =
    forecastId === null ||
    events.some(
      (event) =>
        event.event === "event_card" ||
        event.event === "ask" ||
        event.event === "forecast" ||
        (event.event === "gate" &&
          (event.data as { gate: string }).gate === "A"),
    );
  // 추천 기록에는 카드·게이트 혼입을 금지하는 별도 계약 문맥을 적용한다
  const ctx = events.some((event) => event.event === "recommend")
    ? { mode: "recommend" }
    : isNew
      ? { mode: "new" }
      : { mode: "followup", forecastId };
  const problems: string[] = sequenceProblems(events, ctx);
  if (problems.length) return invalid(`SSE 순서 위반: ${problems[0]}`);
  return selected.map(({ envelope, at }) => ({ envelope, at }));
}
