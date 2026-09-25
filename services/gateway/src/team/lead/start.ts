// 첫 상담의 목적 선택과 방문객 검색을 연결하고 주최자 입력은 기존 플레이북에 넘긴다
import type { TeamMessage } from "../analysis/draft-answer.js";
import { recommendFestivals } from "../recommend/run.js";
import type { EventWriter } from "../runtime/events.js";
import type { Executor } from "../runtime/executor.js";
import type { TeamSession } from "../runtime/sessions.js";
import type { TeamSettings } from "../runtime/settings.js";
import type { Deadline } from "./deadline.js";
import { classifyPurpose } from "./purpose.js";

// 선택 버튼은 원래 요청에 목적만 보태며 지역·유형·날짜를 다시 입력받지 않는다
export async function startConsultation(
  session: TeamSession,
  message: TeamMessage,
  execute: Executor,
  writer: EventWriter,
  deadline: Deadline,
  settings: TeamSettings,
  today: string,
): Promise<TeamMessage | null> {
  if (session.draft && !session.pendingPurpose) return message;
  if (
    !message.answer &&
    /^(?:안전관리\s*)?(?:계획(?:서)?(?:\s*초안)?|초안)(?:을|를)?\s*(?:만들어\s*(?:줘|주세요)|작성해\s*(?:줘|주세요)|부탁해|줘|주세요)?[.!?\s]*$/.test(
      message.text.trim(),
    )
  )
    return message;
  const choice = message.text.trim();
  const selected =
    session.pendingPurpose &&
    ["행사를 여는 쪽이에요", "가 볼 행사를 찾아요"].includes(choice);
  const purpose = selected
    ? choice === "행사를 여는 쪽이에요"
      ? "new"
      : "recommend"
    : await classifyPurpose(message.text, execute, deadline);
  const text = selected ? (session.pendingPurpose as string) : message.text;
  if (purpose === "unclear") {
    session.pendingPurpose = text;
    await writer.emit("ask", {
      field: "intent",
      question: "행사를 여는 쪽인가요, 가 볼 행사를 찾는 쪽인가요?",
      options: ["행사를 여는 쪽이에요", "가 볼 행사를 찾아요"].map((label) => ({
        label,
        value: label,
      })),
    });
    return null;
  }
  session.pendingPurpose = undefined;
  if (purpose === "recommend") {
    await recommendFestivals(
      text,
      today,
      execute,
      writer,
      deadline,
      settings,
      message.near,
    );
    return null;
  }
  return { ...message, text };
}
