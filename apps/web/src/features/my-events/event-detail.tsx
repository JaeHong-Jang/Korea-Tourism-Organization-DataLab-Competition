// 선택 행사 오른쪽에 불변 예보 이력과 재예보·실측·공유 행동을 묶는다.

import type { Event, ReforecastResult } from "@crowdcast/contracts/types";
import { useRef, useState } from "react";
import { FeaturePanel } from "../../components/common/feature-panel";
import { LevelBadge } from "../../components/common/level-badge";
import { formatDate, formatSnapshotNumber } from "../../lib/format";
import {
  MyEventsApiError,
  postReforecast,
  postShare,
} from "../../lib/my-events-api";
import { ActualForm } from "./actual-form";
import type { SavedEvent } from "./event-list";
import { ReforecastCard } from "./reforecast-card";

// 게이트 실패·행사 없음·서비스 실패를 다른 안내로 보여 준다.
// what-if로 바꾼 조건(일시·시간대·요금·유형)의 예보가 저장 행사의 이력에 붙었는지 본다
export function changedCondition(
  snapshotEvent: Pick<
    Event,
    "startsAt" | "endsAt" | "timeOfDay" | "fee" | "type"
  >,
  saved: Pick<Event, "startsAt" | "endsAt" | "timeOfDay" | "fee" | "type">,
): boolean {
  return (["startsAt", "endsAt", "timeOfDay", "fee", "type"] as const).some(
    (key) => snapshotEvent[key] !== saved[key],
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
  const [share, setShare] = useState("");
  const [shareError, setShareError] = useState("");
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const { event, snapshots } = row;
  const latest = snapshots.at(-1);
  const past = Date.parse(event.endsAt) < Date.now();
  return (
    <div className="my-events-detail">
      <FeaturePanel
        id="M5-F2"
        title="예보 이력"
        description="발행된 예보는 수정할 수 없어요."
      >
        <h3>{event.name}</h3>
        <p>
          {formatDate(event.startsAt)} · {event.venue.name}
        </p>
        {snapshots.length === 0 ? (
          <p>아직 발행된 예보가 없어요.</p>
        ) : (
          <ol className="my-events-timeline">
            {snapshots.map((snapshot) => (
              <li key={snapshot.forecastId}>
                <a href={`/f/${encodeURIComponent(snapshot.forecastId)}`}>
                  <span>{formatDate(snapshot.publishedAt)}</span>
                  <strong>
                    {formatSnapshotNumber(snapshot.forecast.peakConcurrent.p50)}{" "}
                    명 · 순간 최대 중앙값
                  </strong>
                </a>
                <LevelBadge judgment={snapshot.forecast.judgment} />
                {changedCondition(snapshot.event, event) && (
                  <small className="my-events-whatif">조건 바꿈(what-if)</small>
                )}
                <small>발행 당시 기록 · 수정 불가</small>
              </li>
            ))}
          </ol>
        )}
      </FeaturePanel>
      <FeaturePanel
        id="M5-F3"
        title="재예보"
        description="저장한 행사로 새 예보를 발행하고 직전 예보와 비교해요."
      >
        <button
          type="button"
          className="my-events-primary"
          disabled={busy}
          onClick={async () => {
            if (inFlight.current) return;
            inFlight.current = true;
            setBusy(true);
            setForecastError("");
            setResult(null);
            try {
              const next = await postReforecast(event.id);
              setResult(next);
              await onForecast();
            } catch (reason) {
              setForecastError(reforecastError(reason));
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
      {past && (
        <FeaturePanel
          id="M5-F4"
          title="실측 입력·채점"
          description="행사 후 확인한 인원과 관측 범위를 남겨요."
        >
          <ActualForm event={event} onSaved={() => onActualSaved(event.id)} />
        </FeaturePanel>
      )}
      <FeaturePanel
        id="M5-F5"
        title="공유 링크"
        description="발행 당시 예보서를 읽기 전용으로 공유해요."
      >
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
