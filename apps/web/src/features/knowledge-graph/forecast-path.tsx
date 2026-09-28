// 선택한 발행 예보의 일평균·환산 가정·순간 최대·판정 경로를 표시한다.
import type { ForecastReport } from "@crowdcast/contracts/types";
import { formatSnapshotNumber } from "../../lib/format";
import type { EvidenceStage } from "./forecast-evidence-data";

// 화면에서 수치를 재계산하지 않고 각 단계의 저장된 결과를 읽는다.
export function ForecastPath({
  report,
  selected,
  onSelect,
}: {
  report: ForecastReport;
  selected: EvidenceStage;
  onSelect: (stage: EvidenceStage) => void;
}) {
  const { dailyMean, peakConcurrent, judgment, assumptions } = report.forecast;
  const used = assumptions.filter((item) =>
    peakConcurrent.assumptionIds.includes(item.id),
  );
  const steps: {
    id: EvidenceStage;
    title: string;
    value: string;
    detail: string;
  }[] = [
    {
      id: "daily",
      title: "일평균 예측",
      value: `${formatSnapshotNumber(dailyMean.p50)} ${dailyMean.unit}`,
      detail: `범위 ${formatSnapshotNumber(dailyMean.p10)}–${formatSnapshotNumber(dailyMean.p90)}`,
    },
    {
      id: "conversion",
      title: "순간 최대 환산",
      value: `가정 ${peakConcurrent.assumptionIds.length}개`,
      detail:
        used.map((item) => item.name).join(" · ") || "환산 가정 기록 없음",
    },
    {
      id: "peak",
      title: `순간 최대${peakConcurrent.estimated ? " 추정" : ""}`,
      value: `${formatSnapshotNumber(peakConcurrent.p50)} ${peakConcurrent.unit}`,
      detail: `범위 ${formatSnapshotNumber(peakConcurrent.p10)}–${formatSnapshotNumber(peakConcurrent.p90)}`,
    },
    {
      id: "judgment",
      title: "최종 판정",
      value: `등급 ${judgment.level} · ${judgment.label}`,
      detail: `${judgment.basis ? `${judgment.basis} 기준 · ` : ""}규칙 ${judgment.ruleIds.length}개`,
    },
  ];
  return (
    <section className="snapshot-path" aria-label="이 예보의 계산 경로">
      <div className="snapshot-evidence__heading">
        <h2>예보가 만들어진 경로</h2>
        <button
          type="button"
          aria-pressed={selected === "all"}
          onClick={() => onSelect("all")}
        >
          전체 근거
        </button>
      </div>
      <p>단계를 누르면 그 숫자에 연결된 근거만 보여요.</p>
      <ol>
        {steps.map((step, index) => (
          <li key={step.id}>
            <button
              type="button"
              aria-pressed={selected === step.id}
              onClick={() => onSelect(step.id)}
            >
              <span>
                {index + 1}. {step.title}
              </span>
              <strong>{step.value}</strong>
              <small>{step.detail}</small>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
