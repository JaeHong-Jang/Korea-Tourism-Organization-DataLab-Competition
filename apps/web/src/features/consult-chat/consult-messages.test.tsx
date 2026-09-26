// 계약 픽스처 수치와 팀장 답이 대화 요약에 안전하게 나오는지 확인한다.
import type {
  AgentStatus,
  Claim,
  EventDraft,
  ForecastCard,
} from "@crowdcast/contracts/types";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { expect, it } from "vitest";
import fixture from "../../../../../packages/contracts/fixtures-sse/valid-new-forecast.json";
import { AgentWorkLine } from "./agent-work-line";
import { ConsultMessages } from "./consult-messages";

const events = fixture as { event: string; seq: number; data: unknown }[];
const get = (event: string) =>
  events.find((item) => item.event === event)?.data;

// 결과는 수치 카드 한 장과 근거 칩 없는 팀장 답으로 읽힌다.
it("픽스처 예보를 한 카드와 답으로 보여 준다", () => {
  const status = get("agent_status") as {
    agentId: "lead";
    team: "lead";
    state: "working";
    note: string;
    stepId: null;
    at: string;
  };
  const markup = renderToStaticMarkup(
    <MemoryRouter>
      <ConsultMessages
        sent={[{ id: "request", text: "영종 씨사이드파크 불꽃축제 예보해 줘" }]}
        forecasts={[
          {
            card: get("forecast") as ForecastCard,
            draft: get("event_card") as EventDraft,
            request: "영종 씨사이드파크",
            messageId: "request",
          },
        ]}
        claims={[{ messageId: "request", claim: get("claim") as Claim }]}
        replies={[
          { messageId: "request", seq: 18, text: "예보서를 살펴보세요." },
        ]}
        work={[{ messageId: "request", seq: 0, status }]}
        gateReplies={[
          {
            messageId: "request",
            gate: {
              gate: "publish",
              passed: true,
              revision: 1,
              masterVersion: 1,
              violations: [],
            },
          },
        ]}
        completed={["request"]}
        busy={false}
      />
    </MemoryRouter>,
  );
  expect(markup.match(/aria-label="예보 요약"/g)).toHaveLength(1);
  expect(markup).toContain("2.1만 명");
  expect(markup).toContain("19:00~21:00");
  expect(markup).toContain("예보서를 살펴보세요.");
  expect(markup).toContain("예보팀이 확인했어요 · 게이트 통과");
  expect(markup).not.toContain("근거 ·");
});

// 작업 줄은 들어온 상태 순서를 유지하고 현재 화면에는 마지막 팀원을 보여 준다.
it("agent_status 순서와 현재 팀원을 그대로 보여 준다", () => {
  const statuses = events
    .filter((item) => item.event === "agent_status")
    .slice(0, 2)
    .map((item) => ({
      messageId: "request",
      seq: item.seq,
      status: item.data as AgentStatus,
    }));
  const working = renderToStaticMarkup(
    <AgentWorkLine statuses={statuses} gates={[]} busy completed={false} />,
  );
  expect(working).toContain("받아쓰기 · 행사 내용을 받아 적는 중");
  const done = renderToStaticMarkup(
    <AgentWorkLine statuses={statuses} gates={[]} busy={false} completed />,
  );
  expect(done.indexOf("팀장 · 요청을 나눠 맡겼어요")).toBeLessThan(
    done.indexOf("받아쓰기 · 행사 내용을 받아 적는 중"),
  );
});
