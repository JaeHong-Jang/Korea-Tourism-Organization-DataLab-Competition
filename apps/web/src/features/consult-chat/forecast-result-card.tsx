// 발행된 예보의 숫자 카드와 검증 문장을 근거 칩 없는 한 장으로 묶는다.
import type { Claim } from "@crowdcast/contracts/types";
import { Link } from "react-router-dom";
import { LevelBadge } from "../../components/common/level-badge";
import { formatQuantity } from "../../lib/format";
import { renderClaim } from "../../lib/render-claim";
import type { ForecastSnapshot } from "./use-consult-session";

// 수치는 예보 카드에서만 가져오고 준비 문장은 발행된 권고에서만 가져온다.
export function ForecastResultCard({
  forecast,
  claims,
}: {
  forecast: ForecastSnapshot;
  claims: Claim[];
}) {
  const { card, draft } = forecast;
  const published = claims.filter(
    (claim) => claim.status === "published" && claim.rendered,
  );
  const conclusion = published.find(
    (claim) => claim.claimType === "판정" || claim.claimType === "설명",
  );
  const tasks = published.filter((claim) => claim.claimType === "권고");
  const href = `/f/${encodeURIComponent(card.id)}`;
  return (
    <section className="consult-result" aria-label="예보 요약">
      <h3>{draft?.name ?? "행사 예보"}</h3>
      <LevelBadge judgment={card.judgment} />
      <p>순간 최대 {formatQuantity(card.peakConcurrent)}</p>
      {card.peakHours && (
        <p>
          가장 붐비는 시간 {card.peakHours.from}~{card.peakHours.to}
        </p>
      )}
      {conclusion && (
        <p className="consult-result__conclusion">{renderClaim(conclusion)}</p>
      )}
      {tasks.length > 0 && (
        <details>
          <summary>준비할 것 {tasks.length}가지</summary>
          <ul>
            {tasks.map((claim) => (
              <li key={claim.id}>{renderClaim(claim)}</li>
            ))}
          </ul>
        </details>
      )}
      <nav className="consult-result__actions" aria-label="예보 이어보기">
        <Link to={href}>예보서 보기</Link>
        <Link to="/graph">근거 그래프</Link>
        <Link to={`${href}#forecast-tab-map`}>근거 정리</Link>
        <Link to={`${href}/plan`}>계획 초안</Link>
      </nav>
      <small>참고용 — 담당자 검토 필수 · 추정 산식 기반</small>
    </section>
  );
}
