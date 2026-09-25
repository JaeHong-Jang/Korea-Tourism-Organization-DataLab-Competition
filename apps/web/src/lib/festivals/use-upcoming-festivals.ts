// 게이트웨이 행사 목록을 계약 검증 후 필터링하고 실패 상태를 분리한다.
import type { FestivalSummary } from "@crowdcast/contracts/types";
import { useEffect, useMemo, useState } from "react";
import { getFestivals } from "../api-client";
import type { FestivalFilters } from "../selection-store";
import { useSelectionStore } from "../selection-store";
import { getDemoTime } from "../theme/sun-state";
import { filterFestivals, koreanDay } from "./filter-festivals";
import { sceneFestivals } from "./scene-fixture";

type Status = "loading" | "ready" | "unavailable" | "error";

// 테마와 같은 데모 시각 해석(더하기 → 공백 복원·잘못된 값 무시)으로 기준 시각을 정한다.
export function festivalsNow(search: string): Date {
  return getDemoTime(search) ?? new Date();
}

// 계약 형식은 맞아도 브라우저가 읽지 못하는 시각(예: 윤초 23:59:60)이면 화면이 멈추지 않게 받지 않는다.
export function hasReadableDates(festival: FestivalSummary): boolean {
  return [festival.startsAt, festival.endsAt].every((value) =>
    Number.isFinite(Date.parse(value)),
  );
}

// 기준 시각의 한국 날짜 — 기간 필터의 오늘.
export function festivalsClock(search: string): string {
  return koreanDay(festivalsNow(search));
}

// 계약 오류는 별도 오류로 남기고 네트워크·미구현 API는 빈 목록으로 둔다.
export function useUpcomingFestivals(filters: FestivalFilters) {
  const diagnostic = new URLSearchParams(window.location.search);
  const fixture = diagnostic.get("sceneFixture") === "1";
  const now = festivalsNow(window.location.search);
  const clock = now.toISOString();
  const today = koreanDay(now);
  const [data, setData] = useState<FestivalSummary[]>([]);
  const [status, setStatus] = useState<Status>(fixture ? "ready" : "loading");
  const [receivedAt, setReceivedAt] = useState<string | null>(null);

  // 원본 요청은 필터 변경마다 반복하지 않고 동일한 검증 목록을 화면에서 좁힌다.
  useEffect(() => {
    if (fixture) return;
    const controller = new AbortController();
    getFestivals(controller.signal)
      .then((festivals) => {
        if (!festivals.every(hasReadableDates)) {
          setData([]);
          setStatus("error");
          return;
        }
        setData(festivals);
        setReceivedAt(new Date().toISOString());
        setStatus("ready");
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setData([]);
        setStatus(
          reason instanceof Error &&
            reason.message.startsWith("API 계약 불일치")
            ? "error"
            : "unavailable",
        );
      });
    return () => controller.abort();
  }, [fixture]);

  // 견본은 화면 진단에서만 만들고 실제 API 실패 화면에는 섞지 않는다.
  const all = useMemo(
    () => (fixture ? sceneFestivals(today) : data),
    [fixture, today, data],
  );
  // 기간 브러시는 현재 기간 밖의 주도 선택할 수 있도록 원본 목록을 공유한다.
  useEffect(() => {
    useSelectionStore.getState().setTimelineFestivals(all);
  }, [all]);
  const festivals = useMemo(
    () => filterFestivals(all, filters, today),
    [all, filters, today],
  );
  return {
    festivals,
    all,
    status,
    receivedAt: fixture ? clock : receivedAt,
    fixture,
    today,
  };
}
