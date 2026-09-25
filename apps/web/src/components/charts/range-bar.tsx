// 예상 인원을 0부터 시작하는 보통 눈금에 그려 법정 기준(1,000명)과 몇 배 차이인지 바로 읽히게 한다.
import type {
  Event,
  FestivalSummary,
  ForecastCard,
} from "@crowdcast/contracts/types";
import {
  formatPeople,
  formatQuantity,
  formatSnapshotNumber,
  representativeValue,
} from "../../lib/format";
import {
  ComponentState,
  type ComponentStatus,
} from "../common/component-state";

type Range = FestivalSummary | ForecastCard["peakConcurrent"];
type HostQuantity = NonNullable<Event["expectedByHost"]>;
const THRESHOLD = 1000;

// 눈금 끝값을 1·2·2.5·5×10ⁿ 중 가장 가까운 큰 수로 올린다.
export function niceCeil(value: number): number {
  const power = 10 ** Math.floor(Math.log10(Math.max(1, value)));
  const step = [1, 2, 2.5, 5, 10].find((item) => item * power >= value) ?? 10;
  return step * power;
}

// 기준 대비 배수는 10배 미만만 소수 한 자리로 적는다.
export function thresholdRatio(value: number): string {
  const ratio = value / THRESHOLD;
  return ratio >= 10
    ? Math.round(ratio).toLocaleString("ko-KR")
    : ratio.toFixed(1);
}

// 구간이 기준 위·걸침·아래 중 어디인지 한 문장으로 말한다.
function headline(low: number, middle: number, high: number) {
  if (low >= THRESHOLD)
    return {
      strong: `법정 기준의 약 ${thresholdRatio(middle)}배`,
      rest: "안전관리계획 수립 대상이에요",
    };
  if (high >= THRESHOLD)
    return {
      strong: "법정 기준을 넘을 수도 있어요",
      rest: "예상 범위가 1,000명을 걸쳐요",
    };
  return {
    strong: "법정 기준보다 적어요",
    rest: "예상 범위가 1,000명 아래예요",
  };
}

// 막대·가운데 선·기준선은 넓은 호버 영역과 표를 함께 두어 키보드와 작은 화면에서도 읽힌다.
export function RangeBar({
  range,
  hostExpected,
  mini = false,
  status = "ready",
}: {
  range?: Range | null;
  hostExpected?: HostQuantity | null;
  mini?: boolean;
  status?: ComponentStatus;
}) {
  if (status !== "ready" || !range)
    return (
      <ComponentState
        name="예측 구간"
        status={status === "ready" ? "empty" : status}
      />
    );

  // 행사 요약의 peak 필드는 계약상 행사장 순간 최대 추정치다.
  const isSummary = "peakP10" in range;
  const low = isSummary ? range.peakP10 : range.p10;
  const middle = isSummary ? range.peakP50 : range.p50;
  const high = isSummary ? range.peakP90 : range.p90;
  const timeUnit = isSummary ? "순간" : range.timeUnit;
  const spatialScope = isSummary ? "행사장" : range.spatialScope;
  const unit = isSummary ? "명" : range.unit;
  if (
    low == null ||
    middle == null ||
    high == null ||
    low < 0 ||
    low > middle ||
    middle > high
  )
    return <ComponentState name="예측 구간" status="error" />;

  // 기간 누적 예상은 순간 최대 예보와 직접 비교할 수 없으므로 눈금 밖에 둔다.
  const expectedValue = hostExpected ? representativeValue(hostExpected) : null;
  const comparable =
    hostExpected != null &&
    expectedValue != null &&
    hostExpected.timeUnit === timeUnit &&
    hostExpected.spatialScope === spatialScope &&
    hostExpected.unit === unit;
  const hostValue = comparable ? expectedValue : null;
  const axisMax = niceCeil(Math.max(high, hostValue ?? 0, THRESHOLD) * 1.08);
  const position = (value: number) =>
    `${Math.round((Math.min(value, axisMax) / axisMax) * 1000) / 10}%`;
  const directRange = `예상 ${formatSnapshotNumber(low)}~${formatSnapshotNumber(high)}명 (가운데 ${formatPeople(middle)})`;
  const rangeText = `${directRange} · ${timeUnit} · ${spatialScope} · 추정 산식 기반`;
  const lead = headline(low, middle, high);
  const hostText =
    hostExpected == null || expectedValue == null
      ? null
      : `주최측 예상 ${formatQuantity(hostExpected)}`;

  return (
    <figure
      className={`range-bar${mini ? " range-bar--mini" : ""}`}
      aria-label={`${rangeText} · ${lead.strong}`}
    >
      {!mini && <h4>순간 최대 예상 인원과 법정 기준</h4>}
      {!mini && (
        <p className="range-bar__conclusion">
          <strong>{lead.strong}</strong> — {lead.rest}
        </p>
      )}
      <div className="range-bar__track">
        <button
          type="button"
          className="range-bar__threshold range-bar__target"
          style={{ left: position(THRESHOLD) }}
          title="법정 기준 1,000명(안전관리계획 수립)"
          aria-label="법정 기준 1,000명(안전관리계획 수립)"
        >
          <span className="range-bar__threshold-tag">
            {mini ? "기준" : "기준 1,000명"}
          </span>
        </button>
        <button
          type="button"
          className="range-bar__band"
          style={{
            left: position(low),
            width: `calc(${position(high)} - ${position(low)})`,
          }}
          title={directRange}
          aria-label={directRange}
        />
        <button
          type="button"
          className="range-bar__median range-bar__target"
          style={{ left: position(middle) }}
          title={`가운데 ${formatPeople(middle)}`}
          aria-label={`가운데 ${formatPeople(middle)}`}
        />
        {hostValue != null && (
          <button
            type="button"
            className="range-bar__host range-bar__target"
            style={{ left: position(hostValue) }}
            title={hostText ?? undefined}
            aria-label={hostText ?? undefined}
          >
            ▲
          </button>
        )}
      </div>
      {!mini && (
        <div className="range-bar__ticks" aria-hidden="true">
          {[0, axisMax / 2, axisMax].map((tick) => (
            <span key={tick} style={{ left: position(tick) }}>
              {tick === 0 ? "0" : formatPeople(tick)}
            </span>
          ))}
        </div>
      )}
      {!mini && <p className="range-bar__direct-label">{directRange}</p>}
      {!mini && (
        <p className="range-bar__legend">
          파란 막대 = 예상 범위(10번 중 8번은 이 안) · 막대 속 굵은 선 = 가운데
          값 · 회색 줄 = 법정 기준 1,000명
          {hostValue != null ? " · ▲ 주최측 예상" : ""}
        </p>
      )}
      <figcaption>
        {mini
          ? `${directRange} · 법정 기준 1,000명의 약 ${thresholdRatio(middle)}배`
          : "순간 최대 · 행사장 · 추정 산식 기반"}
      </figcaption>
      {hostText && !comparable && (
        <p className="range-bar__unmatched">
          {hostText} — 단위가 달라 직접 비교하지 않아요.
        </p>
      )}
      <details className="range-bar__table">
        <summary>값 표 보기</summary>
        <table>
          <caption className="sr-only">예측 구간과 비교 가능한 예상</caption>
          <tbody>
            <tr>
              <th scope="row">하한</th>
              <td>{formatQuantity(low, unit)}</td>
            </tr>
            <tr>
              <th scope="row">가운데</th>
              <td>{formatQuantity(middle, unit)}</td>
            </tr>
            <tr>
              <th scope="row">상한</th>
              <td>{formatQuantity(high, unit)}</td>
            </tr>
            <tr>
              <th scope="row">법정 기준</th>
              <td>1,000명</td>
            </tr>
            {hostText && (
              <tr>
                <th scope="row">주최측 예상</th>
                <td>
                  {hostText}
                  {!comparable ? " · 비교 불가" : ""}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
