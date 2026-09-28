// 선택 행사 오른쪽에 불변 예보 이력과 재예보·실측·공유 행동을 묶는다.

import type { ReforecastResult } from "@crowdcast/contracts/types";
import { useRef, useState } from "react";
import { FeaturePanel } from "../../components/common/feature-panel";
import { LevelBadge } from "../../components/common/level-badge";
import { formatDate, formatSnapshotNumber } from "../../lib/format";
import {
  MyEventsApiError,
  postReforecast,
  postShare,
} from "../../lib/my-events-api";
import { forecastEvidenceHref } from "../knowledge-graph/forecast-evidence-data";
import { forecastBeforeEvent } from "./actual-comparison";
import { ActualForm } from "./actual-form";
import type { SavedEvent } from "./event-list";
import { ReforecastCard } from "./reforecast-card";
import { useFollowScroll } from "./use-follow-scroll";

// 게이트 실패·행사 없음·서비스 실패를 다른 안내로 보여 준다.
// 같은 날 같은 조건이면 예보 id가 같아 새로 발행하지 않는다 — 실패가 아니라 "바뀐 것 없음" 안내다.
export function isUnchanged(reason: unknown): boolean {
  return (
    reason instanceof MyEventsApiError && reason.code === "reforecast_unchanged"
  );
}

export function reforecastError(reason: unknown): string {
  if (reason instanceof MyEventsApiError) {
    if (reason.status === 409) return `발행하지 못했어요. ${reason.message}`;
    if (reason.status === 404)
      return "저장한 행사를 찾지 못했어요. 목록을 새로 열어 주세요.";
    if (reason.status === 503)
      return "예보 서비스를 연결할 수 없어요. 잠시 뒤 다시 시도해 주세요.";
    return reason.message;
  }
  return reason instanceof Error
    ? reason.message
    : "재예보를 완료하지 못했어요.";
}

// 스냅샷 링크는 읽기 전용 발행 예보서로만 연결한다.
export function EventDetail({
  row,
  onForecast,
  onActualSaved,
}: {
  row: SavedEvent;
  onForecast: () => Promise<void>;
  onActualSaved: (id: string) => void;
}) {
  const [result, setResult] = useState<ReforecastResult | null>(null);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [forecastError, setForecastError] = useState("");
  const [unchanged, setUnchanged] = useState(false);
  const [share, setShare] = useState("");
  const [shareError, setShareError] = useState("");
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const { event, snapshots } = row;
  const latest = snapshots.at(-1);
  const ended = Date.parse(event.endsAt) < Date.now();
  const panelRef = useRef<HTMLDivElement | null>(null);
  useFollowScroll(panelRef);

  // 끝난 행사는 다음 할 일이 실측 입력이라 재예보보다 먼저 보여 준다.
  const actualPanel = (
    <FeaturePanel id="M5-F4" title="실측 입력">
      <ActualForm
        event={event}
        forecast={forecastBeforeEvent(snapshots, event.startsAt)}
        onSaved={() => onActualSaved(event.id)}
      />
    </FeaturePanel>
  );
  return (
    <div className="my-events-detail" ref={panelRef}>
      <FeaturePanel id="M5-F2" title="예보 이력">
        <h3>{event.name}</h3>
        <p>
          {formatDate(event.startsAt)} · {event.venue.name}
        </p>
        {snapshots.length === 0 ? (
          <p>아직 발행된 예보가 없어요.</p>
        ) : (
          <ol className="my-events-timeline">
            {snapshots.map((snapshot, index) => (
              <li key={snapshot.forecastId}>
                <div className="my-events-timeline-heading">
                  <strong>{index + 1}차 예보</strong>
                  <time dateTime={snapshot.publishedAt}>
                    {formatDate(snapshot.publishedAt)} 발행
                  </time>
                </div>
                <div className="my-events-timeline-figure">
                  <span>최대 동시 인원</span>
                  <strong>
                    {formatSnapshotNumber(snapshot.forecast.peakConcurrent.p50)}
                    명
                  </strong>
                  <LevelBadge judgment={snapshot.forecast.judgment} />
                </div>
                <div className="my-events-timeline-actions">
                  <a
                    className="my-events-snapshot-report"
                    href={`/f/${encodeURIComponent(snapshot.forecastId)}`}
                    aria-label={`${index + 1}차 예보서 보기`}
                  >
                    예보서 보기
                  </a>
                  <a href={forecastEvidenceHref(snapshot)}>근거 보기 →</a>
                </div>
              </li>
            ))}
          </ol>
        )}
      </FeaturePanel>
      {ended && actualPanel}
      <FeaturePanel id="M5-F3" title="재예보">
        <button
          type="button"
          className="my-events-primary"
          disabled={busy}
          onClick={async () => {
            if (inFlight.current) return;
            inFlight.current = true;
            setBusy(true);
            setForecastError("");
            setUnchanged(false);
            setResult(null);
            try {
              const next = await postReforecast(event.id);
              setResult(next);
              await onForecast();
            } catch (reason) {
              if (isUnchanged(reason)) setUnchanged(true);
              else setForecastError(reforecastError(reason));
            } finally {
              inFlight.current = false;
              setBusy(false);
            }
          }}
        >
          {busy ? "재예보 진행 중…" : "재예보"}
        </button>
        {busy && <p role="status">예보팀이 발행 결과를 확인하고 있어요.</p>}
        {forecastError && <p role="alert">{forecastError}</p>}
        {unchanged && (
          <div className="my-events-unchanged" role="status">
            <strong>직전 예보와 같아요</strong>
            <p>방문 자료나 날씨 예보가 새로 들어오면 달라져요.</p>
            {latest && (
              <p>
                직전 예보: {formatDate(latest.publishedAt)} 발행 · 최대 동시
                인원 {formatSnapshotNumber(latest.forecast.peakConcurrent.p50)}
                명 ·{" "}
                <a href={`/f/${encodeURIComponent(latest.forecastId)}`}>
                  예보서 보기
                </a>
              </p>
            )}
          </div>
        )}
        {result && (
          <ReforecastCard
            result={result}
            evidence={
              snapshots.find(
                (snapshot) => snapshot.forecastId === result.forecastId,
              )?.evidence
            }
          />
        )}
      </FeaturePanel>
      {!ended && actualPanel}
      <FeaturePanel id="M5-F5" title="공유 링크">
        {latest ? (
          <>
            <button
              type="button"
              disabled={sharing}
              onClick={async () => {
                if (sharing) return;
                setSharing(true);
                setShareError("");
                setCopied(false);
                try {
                  const response = await postShare(latest.forecastId);
                  setShare(
                    `${window.location.origin}/s/${encodeURIComponent(response.token)}`,
                  );
                } catch (reason) {
                  setShareError(
                    reason instanceof Error
                      ? reason.message
                      : "공유 링크를 만들지 못했어요.",
                  );
                } finally {
                  setSharing(false);
                }
              }}
            >
              {sharing ? "만드는 중…" : "공유 링크 만들기"}
            </button>
            {share && (
              <div className="my-events-share">
                <label>
                  공유 주소{" "}
                  <input
                    readOnly
                    value={share}
                    onFocus={(event) => event.target.select()}
                  />
                </label>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(share);
                      setCopied(true);
                    } catch {
                      setShareError("주소를 복사하지 못했어요.");
                    }
                  }}
                >
                  주소 복사
                </button>
                <a href={share}>공유 화면 열기</a>
              </div>
            )}
            {copied && <p role="status">주소를 복사했어요.</p>}
            {shareError && <p role="alert">{shareError}</p>}
          </>
        ) : (
          <p>공유할 발행 예보가 없어요.</p>
        )}
      </FeaturePanel>
    </div>
  );
}
