// 보낸 질문과 발행된 근거 문장을 요청 순서대로 대화에 놓는다.
import type { Evidence } from "@crowdcast/contracts/types";
import { Fragment } from "react";
import { Link } from "react-router-dom";
import type { ClaimReply } from "./use-consult-session";

// 뒤이어 온 근거 이벤트는 이미 보이는 문장의 링크 제목을 채운다.
export function ConsultMessages({
  sent,
  claims,
  evidence,
}: {
  sent: { id: string; text: string }[];
  claims: ClaimReply[];
  evidence: Evidence[];
}) {
  return sent.map((message) => (
    <Fragment key={message.id}>
      <p className="consult-bubble consult-bubble--user">{message.text}</p>
      {claims
        .filter(
          ({ messageId, claim }) =>
            messageId === message.id &&
            claim.status === "published" &&
            claim.rendered,
        )
        .map(({ claim }) => (
          <div className="consult-bubble consult-bubble--reply" key={claim.id}>
            <p className="consult-bubble__text">{claim.rendered}</p>
            <div className="consult-bubble__evidence">
              {claim.evidenceIds.map((id) => (
                <Link
                  key={id}
                  to={`/f/${encodeURIComponent(claim.forecastId)}#evidence-${encodeURIComponent(id)}`}
                >
                  근거 · {evidence.find((item) => item.id === id)?.title ?? id}
                </Link>
              ))}
            </div>
          </div>
        ))}
    </Fragment>
  ));
}
