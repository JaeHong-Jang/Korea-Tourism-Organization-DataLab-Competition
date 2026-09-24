// 여섯 종류의 근거를 계약 필드와 연결된 예보 맥락으로 읽을 수 있게 한다.
import type {
  Evidence,
  Forecast,
  SimilarEvent,
} from "@crowdcast/contracts/types";
import { formatDate, formatQuantity } from "../../lib/format";
import { ComponentState, type ComponentStatus } from "./component-state";
import { evidenceKinds } from "./evidence-chip";
import { evidenceNumber } from "./evidence-number";

type EvidenceContext = {
  observation?: Forecast["observations"][number] | null;
  predictionRun?: Forecast["predictionRun"] | null;
  assumption?: Forecast["assumptions"][number] | null;
  similar?: SimilarEvent | null;
  ruleKind?: "법정" | "자체";
};
const checkLabels = {
  evidence: "근거",
  number: "숫자",
  rule: "규정",
  uncertainty: "불확실성",
  ood: "분포 이탈",
};

// 계약 근거에 없는 수치는 만들지 않고 실제 관측·모델·가정을 받은 경우에만 덧붙인다.
export function EvidenceCard({
  evidence,
  number,
  evidenceOrder,
  context,
  defaultOpen = false,
  highlighted = false,
  status = "ready",
}: {
  evidence?: Evidence | null;
  number?: number;
  evidenceOrder?: readonly Evidence[];
  context?: EvidenceContext;
  defaultOpen?: boolean;
  highlighted?: boolean;
  status?: ComponentStatus;
}) {
  if (status !== "ready" || !evidence)
    return (
      <ComponentState
        name="근거 카드"
        status={status === "ready" ? "empty" : status}
      />
    );
  const resolvedNumber = evidenceOrder
    ? evidenceNumber(evidence.id, evidenceOrder)
    : (number ?? 1);
  if (resolvedNumber == null)
    return <ComponentState name="근거 번호" status="error" />;
  const { Icon, label } = evidenceKinds[evidence.kind];
  const observation = context?.observation;
  const assumption = context?.assumption;
  const similar = context?.similar;

  // 같은 번호의 칩이 이 카드로 이동하므로 접힌 상태에서도 제목과 번호를 유지한다.
  return (
    <details
      id={`evidence-${evidence.id}`}
      className={`evidence-card evidence-card--${evidence.kind}${highlighted ? " evidence-card--highlighted" : ""}`}
      open={defaultOpen}
    >
      <summary
        aria-label={`근거 ${resolvedNumber}, ${label}: ${evidence.title}`}
      >
        <Icon size={17} aria-hidden="true" />
        <span className="evidence-card__number">[{resolvedNumber}]</span>
        <span>{evidence.title}</span>
        <small>{label}</small>
      </summary>
      <div className="evidence-card__body">
        <p>{evidence.summary}</p>
        {/* 데이터 근거에는 출처와 공개일, 연결된 관측값을 함께 둔다. */}
        {evidence.kind === "data" && (
          <>
            <p>
              출처 {evidence.source?.publisher} · {evidence.source?.title}
            </p>
            {evidence.source?.datalabMenu && (
              <p>메뉴 {evidence.source.datalabMenu}</p>
            )}
            {evidence.period && (
              <p>
                기간 {evidence.period.from} ~ {evidence.period.to}
              </p>
            )}
            {observation && (
              <p>
                지표 {observation.featureName} ·{" "}
                {formatQuantity(observation.value, observation.unit)}
              </p>
            )}
            {evidence.availableAt && (
              <p>공개일 {formatDate(evidence.availableAt)}</p>
            )}
          </>
        )}
        {/* 모델 근거에는 예보 실행에 기록된 학습 기간만 쓴다. */}
        {evidence.kind === "model" && (
          <>
            <p>모델 버전 {evidence.modelVersion}</p>
            {context?.predictionRun && (
              <p>
                학습 범위 {context.predictionRun.trainRange.from} ~{" "}
                {context.predictionRun.trainRange.to}
              </p>
            )}
          </>
        )}
        {/* 규정 근거는 법정 여부와 계약의 규칙·조항 연결을 남긴다. */}
        {evidence.kind === "rule" && (
          <>
            <p>
              {context?.ruleKind ?? (evidence.clauseId ? "법정" : "자체")} ·{" "}
              {evidence.title}
            </p>
            <p>
              규칙 {evidence.ruleId}
              {evidence.clauseId && ` · 조항 ${evidence.clauseId}`}
            </p>
          </>
        )}
        {/* 사례 근거는 다른 집계 단위가 섞일 때 차이를 계산하지 않는다. */}
        {evidence.kind === "case" && (
          <>
            <p>
              과거 행사{" "}
              {similar ? `${similar.year} ${similar.name}` : evidence.title}
            </p>
            {similar?.measured && (
              <p>
                {similar.measured.estimated ? "실측 추정" : "실측"}{" "}
                {formatQuantity(similar.measured)}
              </p>
            )}
            {similar?.announced && (
              <p>발표 {formatQuantity(similar.announced)}</p>
            )}
            {similar && (
              <p>
                {similar.unitsComparable
                  ? "같은 단위로 비교할 수 있어요."
                  : "단위가 달라 직접 비교하지 않아요."}
              </p>
            )}
          </>
        )}
        {/* 가정 근거에는 입력값과 허용 범위를 원본 그대로 적는다. */}
        {evidence.kind === "assumption" && (
          <>
            <p>가정 {assumption?.name ?? evidence.title}</p>
            {assumption && (
              <p>
                값 {formatQuantity(assumption.value, assumption.unit)} · 범위{" "}
                {formatQuantity(assumption.low, assumption.unit)} ~{" "}
                {formatQuantity(assumption.high, assumption.unit)}
              </p>
            )}
            {assumption && (
              <p>
                근거 {assumption.basis} · {assumption.note}
              </p>
            )}
          </>
        )}
        {/* 검증 근거에는 검사 결과와 수정판을 함께 적는다. */}
        {evidence.kind === "check" && evidence.checkResult && (
          <>
            <p>
              검사 {checkLabels[evidence.checkResult.checkKind]} ·{" "}
              {evidence.checkResult.passed ? "통과" : "확인 필요"}
            </p>
            <p>수정판 {evidence.checkResult.revision}</p>
            {evidence.availableAt && (
              <p>검증 시각 {formatDate(evidence.availableAt)}</p>
            )}
          </>
        )}
        {evidence.source?.accessUrl && (
          <a href={evidence.source.accessUrl} target="_blank" rel="noreferrer">
            원문 보기
          </a>
        )}
      </div>
    </details>
  );
}
