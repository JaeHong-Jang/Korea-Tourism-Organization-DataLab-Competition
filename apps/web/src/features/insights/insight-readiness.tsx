// 서버가 계산한 비교 제외 사유를 검증한 뒤 사용자에게 필요한 보완 항목만 보여 준다.
import type { Insight } from "@crowdcast/contracts/types";
import { insightEvidence } from "./insight-data";
import { PastAnnouncementCoverage } from "./past-announcement-coverage";

const STAGES = {
  eventMissing: "행사 정보 연결 안 됨",
  observationIneligible: "관측 범위·집계 방식이 비교 조건과 다름",
  announcementMissing: "같은 행사·연도의 발표 자료 연결 안 됨",
  conditionsMismatch: "발표일·기간·장소·단위 조건 미확인 또는 불일치",
  ambiguous: "발표 자료가 여러 개여서 하나로 확정할 수 없음",
  matched: "비교 가능",
};

// 단계별 합계가 입력 관측 건수와 맞을 때만 새로운 진단을 표시한다.
export function InsightReadiness({ insight }: { insight: Insight }) {
  const raw = insightEvidence(insight).find(
    (row) => row.comparisonDiagnostics,
  )?.comparisonDiagnostics;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const stages = value.stages as Record<string, number> | undefined;
  if (
    value.version !== 1 ||
    !stages ||
    !Number.isInteger(value.labelRows) ||
    Object.keys(STAGES).some(
      (key) => !Number.isInteger(stages[key]) || stages[key] < 0,
    ) ||
    Object.keys(STAGES).reduce((sum, key) => sum + stages[key], 0) !==
      value.labelRows ||
    stages.matched !== insight.comparablePairs
  )
    return null;
  const eligible =
    (value.labelRows as number) -
    stages.eventMissing -
    stages.observationIneligible;
  // 관측 조건을 통과했지만 비교가 막힌 행사만 실제 보완 대상으로 묶는다.
  const followUp = Array.isArray(value.followUp) ? value.followUp : [];
  const validFollowUp =
    followUp.length === eligible - stages.matched &&
    followUp.every(
      (row) =>
        row &&
        typeof row.eventName === "string" &&
        Number.isInteger(row.year) &&
        ["announcementMissing", "conditionsMismatch", "ambiguous"].includes(
          row.status,
        ),
    );
  const grouped = validFollowUp
    ? [
        ...new Map(
          [...followUp]
            .sort((a, b) => b.year - a.year)
            .map((row) => [
              JSON.stringify(row.festivalKey ?? row.eventName),
              row.eventName,
            ]),
        ).entries(),
      ]
    : [];
  return (
    <section className="insights-callout" aria-label="비교 자료 확인 결과">
      <h4>
        {eligible > 0
          ? "자료는 있지만, 비교 조건 확인이 남았어요"
          : "비교에 쓸 행사장 관측 자료가 필요해요"}
      </h4>
      <dl className="insights-status-grid">
        <div>
          <dt>행사장 관측 자료</dt>
          <dd>{eligible.toLocaleString("ko-KR")}건</dd>
        </div>
        <div>
          <dt>조건 확인·연결 필요</dt>
          <dd>{(eligible - stages.matched).toLocaleString("ko-KR")}건</dd>
        </div>
        <div>
          <dt>비교 가능</dt>
          <dd>{stages.matched}쌍</dd>
        </div>
      </dl>
      <p>
        행사장 관측 조건을 충족한 자료 {eligible.toLocaleString("ko-KR")}건 중
        비교까지 연결된 자료는 {stages.matched}건이에요.
      </p>
      <ul>
        {Object.entries(STAGES)
          .filter(
            ([key]) =>
              !["observationIneligible", "eventMissing", "matched"].includes(
                key,
              ) && stages[key] > 0,
          )
          .map(([key, label]) => (
            <li key={key}>
              {label}: {stages[key]}건
            </li>
          ))}
      </ul>
      {grouped.length > 0 && (
        <div className="insights-next-step">
          <h4>먼저 보완할 행사</h4>
          {grouped.slice(0, 3).map(([key, name]) => (
            <p key={key}>
              <b>{name.replace(/^제\s*\d+\s*회\s*/, "")}</b>
              <br />
              {[
                ...new Set(
                  followUp
                    .filter(
                      (row) =>
                        JSON.stringify(row.festivalKey ?? row.eventName) ===
                        key,
                    )
                    .map((row) => row.year),
                ),
              ]
                .sort()
                .join(" · ")}
              년
            </p>
          ))}
          {grouped.length > 3 && (
            <p>그 외 {grouped.length - 3}개 행사도 자료 보완이 필요해요.</p>
          )}
          <p>
            행사장 관측 자료가 있는 행사부터 선정했어요. 주최측 성과보고서의
            방문객 집계 기간·장소·방식과 발표일을 확인하면 비교 가능 여부를
            판단할 수 있어요.
          </p>
        </div>
      )}
      <details className="insights-details">
        <summary>확인한 자료와 보완 결과</summary>
        <p>
          관측 자료 {Number(value.labelRows).toLocaleString("ko-KR")}건을
          순서대로 검사했어요. 아래 사유는 중복되지 않아요.
        </p>
        <ul>
          {Object.entries(STAGES).map(([key, label]) => (
            <li key={key}>
              {label}: {stages[key].toLocaleString("ko-KR")}건
            </li>
          ))}
        </ul>
        {typeof value.restoredAnnouncementYears === "number" &&
          Number.isInteger(value.restoredAnnouncementYears) &&
          value.restoredAnnouncementYears >= 0 && (
            <p>
              출처 행과 머리글을 대조해 발표 대상 연도{" "}
              {value.restoredAnnouncementYears.toLocaleString("ko-KR")}건을
              복원했어요. 연도 복원만으로 비교 가능한 자료가 되는 것은 아니에요.
            </p>
          )}
        <p>
          다음 확인 항목: 발표일, 방문객 집계 기간·장소·단위. 행사 계획 일정이나
          파일 수정일로 대신 채우지 않아요.
        </p>
      </details>
      <PastAnnouncementCoverage value={value.pastAnnouncementCoverage} />
    </section>
  );
}
