// 요청마다 사용자 질문, 실제 작업 상태, 팀장 답과 예보 요약을 묶는다.
import { Fragment } from "react";
import { renderClaim } from "../../lib/render-claim";
import { AgentWorkLine } from "./agent-work-line";
import { ForecastResultCard } from "./forecast-result-card";
import type {
  ClaimReply,
  ForecastSnapshot,
  GateReply,
  StatusReply,
  TextReply,
} from "./use-consult-session";

// 발행 문장의 근거는 예보서와 그래프에 남겨 대화의 읽는 흐름을 지킨다.
export function ConsultMessages({
  sent,
  claims,
  forecasts,
  replies,
  work,
  gateReplies,
  completed,
  busy,
}: {
  sent: { id: string; text: string }[];
  claims: ClaimReply[];
  forecasts: ForecastSnapshot[];
  replies: TextReply[];
  work: StatusReply[];
  gateReplies: GateReply[];
  completed: string[];
  busy: boolean;
}) {
  return sent.map((message, index) => {
    const complete = completed.includes(message.id);
    const card = forecasts.find((item) => item.messageId === message.id);
    const messageClaims = claims
      .filter((item) => item.messageId === message.id)
      .map((item) => item.claim);
    const messageWork = work.filter((item) => item.messageId === message.id);
    const messageGates = gateReplies
      .filter((item) => item.messageId === message.id)
      .map((item) => item.gate);
    const messageReplies = replies.filter(
      (item) => item.messageId === message.id,
    );
    const fallback =
      complete && !card && !messageReplies.length
        ? messageClaims.find(
            (claim) =>
              claim.status === "published" &&
              claim.rendered &&
              claim.claimType !== "수치",
          )
        : null;
    return (
      <Fragment key={message.id}>
        <p className="consult-bubble consult-bubble--user">{message.text}</p>
        <AgentWorkLine
          statuses={messageWork}
          gates={messageGates}
          busy={busy && index === sent.length - 1}
          completed={complete}
        />
        {complete && card && (
          <ForecastResultCard forecast={card} claims={messageClaims} />
        )}
        {fallback && (
          <p className="consult-bubble consult-bubble--reply">
            {renderClaim(fallback)}
          </p>
        )}
        {messageReplies.map((item) => (
          <p
            className="consult-bubble consult-bubble--reply"
            key={`${message.id}-reply-${item.seq}`}
          >
            {item.text}
          </p>
        ))}
      </Fragment>
    );
  });
}
