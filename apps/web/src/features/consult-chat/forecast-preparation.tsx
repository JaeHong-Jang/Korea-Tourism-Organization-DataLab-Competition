// 검증된 준비 권고를 번호와 개별 카드로 나누어 읽기 쉽게 표시한다.
import type { Claim } from "@crowdcast/contracts/types";
import { renderClaim } from "../../lib/render-claim";
import "./forecast-preparation.css";

// 권고의 원문과 순서를 유지하고 각 항목의 시작을 시각적으로 구분한다.
export function ForecastPreparation({ tasks }: { tasks: Claim[] }) {
  if (!tasks.length) return null;
  return (
    <details className="forecast-preparation">
      <summary>
        준비할 것 <span>{tasks.length}가지</span>
      </summary>
      <ol className="forecast-preparation__list">
        {tasks.map((claim, index) => (
          <li className="forecast-preparation__item" key={claim.id}>
            <span className="forecast-preparation__number" aria-hidden="true">
              {index + 1}
            </span>
            <span className="forecast-preparation__text">
              {renderClaim(claim)}
            </span>
          </li>
        ))}
      </ol>
    </details>
  );
}
