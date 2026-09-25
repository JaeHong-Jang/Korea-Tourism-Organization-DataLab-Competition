// 저장 행사 목록과 선택한 행사의 예보 이력·후속 행동을 연결한다.
import { useEffect, useState } from "react";
import { EmptyState } from "../components/common/empty-state";
import { ErrorState } from "../components/common/error-state";
import { FeaturePanel } from "../components/common/feature-panel";
import { PageHeading } from "../components/common/page-heading";
import { EventDetail } from "../features/my-events/event-detail";
import {
  EventList,
  orderedSnapshots,
  type SavedEvent,
} from "../features/my-events/event-list";
import { getEventSnapshots, getSavedEvents } from "../lib/my-events-api";
import "../styles/my-events.css";

// 목록과 각 행사 스냅샷을 함께 읽어 등급·발행 시각을 계약 값으로 채운다.
export function MyEventsPage() {
  const [rows, setRows] = useState<SavedEvent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [savedActuals, setSavedActuals] = useState<Set<string>>(
    () => new Set(),
  );
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");

  // 취소된 요청의 결과가 다른 화면에 남지 않게 한다.
  useEffect(() => {
    const controller = new AbortController();
    getSavedEvents(controller.signal)
      .then(async (events) => {
        const loaded = await Promise.all(
          events.map(async (event) => ({
            event,
            snapshots: orderedSnapshots(
              await getEventSnapshots(event.id, controller.signal),
            ),
          })),
        );
        if (!controller.signal.aborted) {
          setRows(loaded);
          setSelectedId(loaded[0]?.event.id ?? null);
          setState("ready");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError("저장한 행사를 열 수 없어요. 잠시 뒤 다시 시도해 주세요.");
          setState("error");
        }
      });
    return () => controller.abort();
  }, []);

  // 재예보 발행 후에는 선택 행사의 이력을 다시 읽어 표와 타임라인을 맞춘다.
  const refreshSnapshots = async () => {
    if (!selectedId) return;
    const snapshots = orderedSnapshots(await getEventSnapshots(selectedId));
    setRows((current) =>
      current.map((row) =>
        row.event.id === selectedId ? { ...row, snapshots } : row,
      ),
    );
  };
  const selected = rows.find((row) => row.event.id === selectedId);
  return (
    <div className="page-wrap regular-page my-events-page">
      <PageHeading
        eyebrow="S5 · 저장한 행사"
        title="내 행사"
        description="저장한 행사와 발행 예보를 다시 찾아보세요."
      />
      {state === "loading" && (
        <EmptyState
          message="저장한 행사를 불러오고 있어요."
          action={<span>잠시만 기다려 주세요.</span>}
        />
      )}
      {state === "error" && <ErrorState message={error} />}
      {state === "ready" && rows.length === 0 && (
        <EmptyState
          message="상담에서 예보를 저장하면 여기에 모여요"
          action={<a href="/consult">예보 상담으로</a>}
        />
      )}
      {state === "ready" && rows.length > 0 && (
        <div className="my-events-layout">
          <FeaturePanel
            id="M5-F1"
            title="저장한 행사"
            description="행사명·일자·등급·상태·마지막 예보를 살펴보세요."
            className="my-events-list"
          >
            <EventList
              rows={rows}
              selectedId={selectedId}
              onSelect={setSelectedId}
              saved={savedActuals}
            />
          </FeaturePanel>
          {selected && (
            <EventDetail
              key={selected.event.id}
              row={selected}
              onForecast={refreshSnapshots}
              onActualSaved={(id) =>
                setSavedActuals((current) => new Set(current).add(id))
              }
            />
          )}
        </div>
      )}
    </div>
  );
}
