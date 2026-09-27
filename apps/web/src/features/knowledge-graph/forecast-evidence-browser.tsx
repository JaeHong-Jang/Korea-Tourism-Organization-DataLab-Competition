// 행사와 발행 시점을 주소에 보존해 같은 예보의 근거를 다시 열 수 있게 한다.
import { Link, useSearchParams } from "react-router-dom";
import { ErrorState } from "../../components/common/error-state";
import { LoadingState } from "../../components/common/loading-state";
import { getForecastReport } from "../../lib/api-client";
import { getEventSnapshots, getSavedEvents } from "../../lib/my-events-api";
import { publishedLabel } from "./forecast-evidence-data";
import { SnapshotEvidence } from "./snapshot-evidence";
import { useGraphResource } from "./use-graph-resource";

// 목록 요청도 선택 기록 요청과 같은 취소·재시도 규칙으로 읽는다.
const loadEvents = (_key: string, signal: AbortSignal) =>
  getSavedEvents(signal);

// 직접 링크로 연 발행본은 행사 목록이나 다른 서비스의 실패와 독립적으로 표시한다.
export function ForecastEvidenceBrowser() {
  const [params, setParams] = useSearchParams();
  const requestedEvent = params.get("eventId");
  const forecastId = params.get("forecastId");
  const events = useGraphResource("saved", loadEvents);
  const direct = useGraphResource(forecastId, getForecastReport);
  const eventId =
    requestedEvent ??
    direct.value?.event.id ??
    (!forecastId ? events.value?.[0]?.id : null) ??
    null;
  const snapshots = useGraphResource(eventId, getEventSnapshots);
  const history = [...(snapshots.value ?? [])].sort(
    (a, b) =>
      Date.parse(b.publishedAt) - Date.parse(a.publishedAt) ||
      a.forecastId.localeCompare(b.forecastId),
  );
  const state = forecastId ? direct : snapshots;
  const report = forecastId ? direct.value : history[0];
  const mismatch = Boolean(
    report &&
      (report.event.id !== eventId ||
        (forecastId && report.forecastId !== forecastId)),
  );
  const options = [...(events.value ?? [])];
  if (report && !options.some((item) => item.id === report.event.id))
    options.unshift(report.event);
  if (report && !history.some((item) => item.forecastId === report.forecastId))
    history.unshift(report);

  // 행사 전환 시 이전 발행 식별자를 지워 다른 행사의 수치가 섞이지 않게 한다.
  function chooseEvent(id: string) {
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.set("eventId", id);
      next.delete("forecastId");
      return next;
    });
  }

  // 발행 시점 선택은 정확한 예보 식별자로 고정하고 브라우저 뒤로 가기를 지원한다.
  function chooseForecast(id: string) {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (eventId) next.set("eventId", eventId);
      next.set("forecastId", id);
      return next;
    });
  }

  return (
    <section className="forecast-evidence-browser" aria-label="발행 예보 선택">
      <div className="snapshot-selector">
        <label>
          행사
          <select
            value={eventId ?? ""}
            onChange={(event) => chooseEvent(event.target.value)}
            disabled={!options.length}
          >
            {!options.length && (
              <option value="">
                {events.status === "loading"
                  ? "행사 불러오는 중…"
                  : "저장된 행사 없음"}
              </option>
            )}
            {options.length > 0 && !eventId && (
              <option value="">예보의 행사 확인 중…</option>
            )}
            {eventId && !options.some((item) => item.id === eventId) && (
              <option value={eventId}>선택한 행사</option>
            )}
            {options.map((event) => (
              <option key={event.id} value={event.id}>
                {event.name} · {event.startsAt.slice(0, 10)}
              </option>
            ))}
          </select>
        </label>
        <label>
          예보 발행 시점
          <select
            value={forecastId ?? report?.forecastId ?? ""}
            onChange={(event) => chooseForecast(event.target.value)}
            disabled={!history.length || mismatch}
          >
            {!history.length && (
              <option value={forecastId ?? ""}>
                {state.status === "loading"
                  ? "발행 기록 불러오는 중…"
                  : "발행 기록 없음"}
              </option>
            )}
            {forecastId &&
              !history.some((item) => item.forecastId === forecastId) && (
                <option value={forecastId}>요청한 발행 기록</option>
              )}
            {history.map((item, index) => (
              <option key={item.forecastId} value={item.forecastId}>
                {publishedLabel(item.publishedAt)} · 기록{" "}
                {history.length - index}
              </option>
            ))}
          </select>
        </label>
      </div>
      {events.status === "error" && (
        <ErrorState
          message="행사 목록을 불러오지 못했어요."
          action={
            <button type="button" onClick={events.retry}>
              행사 목록 재시도
            </button>
          }
        />
      )}
      {forecastId && snapshots.status === "error" && (
        <ErrorState
          message="다른 발행 시점의 목록을 불러오지 못했어요."
          action={
            <button type="button" onClick={snapshots.retry}>
              이력 재시도
            </button>
          }
        />
      )}
      {state.status === "error" ? (
        <ErrorState
          message={`요청한 예보를 불러오지 못했어요. ${state.error ?? ""}`}
          action={
            <button type="button" onClick={state.retry}>
              예보 재시도
            </button>
          }
        />
      ) : mismatch ? (
        <ErrorState
          message="주소의 행사와 발행 예보가 일치하지 않아요."
          action={
            <button
              type="button"
              onClick={() => {
                if (report)
                  setParams({
                    eventId: report.event.id,
                    forecastId: report.forecastId,
                  });
              }}
            >
              예보에 기록된 행사로 열기
            </button>
          }
        />
      ) : report ? (
        <SnapshotEvidence key={report.forecastId} report={report} />
      ) : state.status === "loading" || events.status === "loading" ? (
        <LoadingState message="발행 당시 예보와 근거를 불러오는 중이에요." />
      ) : events.status === "error" && !eventId ? null : (
        <div className="snapshot-evidence__empty">
          <h2>
            {eventId ? "아직 발행된 예보가 없어요" : "저장된 행사가 없어요"}
          </h2>
          <p>
            내 행사에서 예보를 발행하면 당시 수치와 근거를 확인할 수 있어요.
          </p>
          <Link to="/my">내 행사로 이동 →</Link>
        </div>
      )}
    </section>
  );
}
