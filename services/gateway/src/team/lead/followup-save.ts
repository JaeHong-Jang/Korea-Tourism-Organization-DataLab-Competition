// 불변 스냅샷을 확인하고 없을 때만 최초 발행 예보서를 다시 저장한다
import { isDeepStrictEqual } from "node:util";
import { createRecordsClient } from "../../clients/records-client.js";
import { ServiceHttpError } from "../../clients/request-json.js";
import type { Agent } from "../runtime/agent.js";
import type { Executor } from "../runtime/executor.js";
import type { TeamSession } from "../runtime/sessions.js";
import type { TeamSettings } from "../runtime/settings.js";
import type { Deadline } from "./deadline.js";

// 조회·행사 저장·스냅샷 저장 전체를 한 예산 안에 묶는다
export async function savePublished(
  session: TeamSession,
  execute: Executor,
  deadline: Deadline,
  settings: TeamSettings,
) {
  const agent: Agent<null, null> = {
    id: "lead",
    team: "lead",
    usesLlm: false,
    budgetMs: 5_000,
    // 조회 실패를 미저장으로 추측하지 않고 명시적인 없음 응답만 재저장한다
    async run({ signal }) {
      const report = session.published?.report;
      if (!report) throw new Error("발행 묶음이 없습니다");
      const storedEvent = session.storedEvent ?? report.event;
      const records = createRecordsClient({
        baseUrl: settings.config.services.records,
        fetch: settings.fetcher,
        signal,
        timeoutMs: 5_000,
      });
      try {
        const snapshot = await records.getSnapshot(report.forecastId);
        if (
          snapshot.forecastId !== report.forecastId ||
          snapshot.event.id !== report.event.id ||
          snapshot.sessionId !== session.id
        )
          throw new Error("스냅샷 식별자가 다릅니다");
      } catch (error) {
        if (!(error instanceof ServiceHttpError) || error.status !== 404)
          throw error;

        // 행사만 저장된 이전 시도는 내용까지 확인해 중복 생성 없이 이어 간다
        try {
          const event = await records.getEvent(report.event.id);
          if (!isDeepStrictEqual(event, storedEvent))
            throw new Error("저장된 행사 내용이 다릅니다");
        } catch (error) {
          if (!(error instanceof ServiceHttpError) || error.status !== 404)
            throw error;
          await records.saveEvent(storedEvent);
        }
        await records.saveSnapshot(report.event.id, report);
      }
      return { value: null, note: "예보서를 저장했어요" };
    },
  };
  try {
    await execute(agent, null, "발행된 예보서의 저장을 확인해요.");
  } catch {
    deadline.check();
    await execute(
      {
        ...agent,
        budgetMs: 1_000,
        // 저장 장애와 시간 초과는 추가 쓰기 없이 다시 누를 수 있는 안내로 끝낸다
        async run() {
          return {
            value: null,
            status: "blocked",
            note: "저장하지 못했어요 — 잠시 뒤 다시 눌러 주세요",
          };
        },
      },
      null,
      "저장 결과를 안내해요.",
    );
  }
}
