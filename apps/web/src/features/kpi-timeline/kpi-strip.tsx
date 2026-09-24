// 필터된 행사 계약을 네 등급의 행사 건수로만 집계한다.
import type { FestivalSummary } from "@crowdcast/contracts/types";
import { Info } from "lucide-react";
import { formatDate } from "../../lib/format";

// 목록과 동일한 필터 결과에서만 수치를 세어 선택 간 차이를 막는다.
export function KpiStrip({
  festivals,
  receivedAt,
  fixture,
  status = "ready",
}: {
  festivals: FestivalSummary[];
  receivedAt: string | null;
  fixture: boolean;
  status?: string;
}) {
  if (status === "loading")
    return <p role="status">행사 집계를 불러오는 중이에요.</p>;
  if (status === "error")
    return <p role="alert">행사 집계를 확인할 수 없어요.</p>;
  const metrics = [
    ["예보 행사", festivals.length],
    ["수립 대상", festivals.filter((festival) => festival.level === 3).length],
    ["권고", festivals.filter((festival) => festival.level === 2).length],
    ["대규모", festivals.filter((festival) => festival.level === 4).length],
  ] as const;
  return (
    <div className="scene-kpis">
      <div className="scene-kpis__tiles">
        {metrics.map(([label, count]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{count}건</strong>
          </div>
        ))}
      </div>
      <details className="scene-kpis__source">
        <summary aria-label="행사 KPI 출처">
          <Info size={14} aria-hidden="true" /> 출처
        </summary>
        <p>
          {fixture ? "진단용 견본 행사" : "다가오는 행사 일괄 예보"} · 기준 시각{" "}
          {fixture && receivedAt ? formatDate(receivedAt) : "제공되지 않음"}
          {!fixture && receivedAt ? ` · 조회 ${formatDate(receivedAt)}` : ""}
        </p>
      </details>
    </div>
  );
}
