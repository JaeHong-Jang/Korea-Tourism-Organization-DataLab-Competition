// 예측 구간을 로그 축에 그리고 같은 집계 단위의 주최측 예상만 축에 올린다.
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
const axisTicks = [100, 1000, 10_000, 100_000];

// 좌표에만 로그 계산을 적용하고 표시값은 계약 수치 그대로 둔다.
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

  // 기간 누적 예상은 순간 최대 예보와 직접 비교할 수 없으므로 축 밖에 둔다.
  const expectedValue = hostExpected ? representativeValue(hostExpected) : null;
  const comparable =
    hostExpected != null &&
    expectedValue != null &&
    hostExpected.timeUnit === timeUnit &&
    hostExpected.spatialScope === spatialScope &&
    hostExpected.unit === unit;
  const hostValue = comparable ? expectedValue : null;
  const maxValue =
    10 ** Math.ceil(Math.log10(Math.max(high, hostValue ?? 0, 100_000)));
  const position = (value: number) =>
    `${(Math.log10(Math.max(1, value)) / Math.log10(maxValue)) * 100}%`;
  const directRange = `예상 ${formatSnapshotNumber(low)}~${formatSnapshotNumber(high)}명 (가운데 ${formatPeople(middle)})`;
  const rangeText = `${directRange} · ${timeUnit} · ${spatialScope} · 추정 산식 기반`;
  const ratio = Math.round(middle / 1000);
  const conclusion =
    low >= 1000
      ? `기준보다 약 ${ratio}배 — 수립 대상 구간이에요`
      : high >= 1000
        ? "법정 기준을 걸치는 구간이에요"
        : "법정 기준 아래 구간이에요";
  const hostText =
    hostExpected == null || expectedValue == null
      ? null
      : `주최측 예상 ${formatQuantity(hostExpected)}`;

  // 선과 점은 넓은 호버 영역과 표를 함께 제공해 키보드와 작은 화면에서도 읽히게 한다.
  return (
    <figure
      className={`range-bar${mini ? " range-bar--mini" : ""}`}
      aria-label={rangeText}
    >
      {!mini && <h4>순간 최대 예상 인원과 법정 기준</h4>}
      {!mini && <p className="range-bar__direct-label">{directRange}</p>}
      <div className="range-bar__track">
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
          title={`중앙 ${formatPeople(middle)}`}
          aria-label={`중앙 ${formatPeople(middle)}`}
        />
        <button
          type="button"
          className="range-bar__threshold range-bar__target"
          style={{ left: position(1000) }}
          title="법정 기준 1,000명(안전관리계획 수립)"
          aria-label="법정 기준 1,000명(안전관리계획 수립)"
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
      <div className="range-bar__ticks" aria-hidden="true">
        {axisTicks
          .filter((tick) => tick !== 1000)
          .map((tick) => (
            <span key={tick} style={{ left: position(tick) }}>
              {formatPeople(tick)}
            </span>
          ))}
      </div>
      <p className="range-bar__threshold-label">
        점선: 법정 기준 1,000명{mini ? "" : "(안전관리계획 수립)"}
      </p>
      {!mini && <p className="range-bar__conclusion">{conclusion}</p>}
      {!mini && (
        <p className="range-bar__axis-label">
          로그 축 · 막대는 예상 구간, 세로선은 가운데 값
          {hostValue != null ? " · ▲ 주최측 예상" : ""}
        </p>
      )}
      <figcaption>
        {mini
          ? `${directRange} · 추정 산식 기반`
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
              <th scope="row">중앙</th>
              <td>{formatQuantity(middle, unit)}</td>
            </tr>
            <tr>
              <th scope="row">상한</th>
              <td>{formatQuantity(high, unit)}</td>
            </tr>
            <tr>
              <th scope="row">기준선</th>
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
