// 곧 열리는 행사를 날짜 순으로 바로 보여 주고, 이름·지역을 적으면 그 안에서 좁힌다.
import type { FestivalSummary } from "@crowdcast/contracts/types";
import { useEffect, useState } from "react";
import { GradeMark } from "../../components/scene/grade-mark";
import { getFestivals } from "../../lib/api-client";
import { formatDate } from "../../lib/format";
import { useTheme } from "../../lib/theme/theme-provider";
import { dDayLabel, soonestFestivals } from "./soonest-festivals";

// 목록은 한 번만 읽고, 입력 없이도 가까운 행사 5개(더 보기 12개)를 먼저 보여 준다.
export function FestivalPicker({
  onPick,
}: {
  onPick: (festival: FestivalSummary) => void;
}) {
  const [query, setQuery] = useState("");
  const [more, setMore] = useState(false);
  const [festivals, setFestivals] = useState<FestivalSummary[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  // 스키마 검증에 실패하면 선택을 막고 설명으로 시작하도록 안내한다.
  useEffect(() => {
    const controller = new AbortController();
    getFestivals(controller.signal)
      .then((items) => {
        setFestivals(items);
        setStatus("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("error");
      });
    return () => controller.abort();
  }, []);

  // 앱 시계(?at= 데모 시각 포함)를 기준으로 남은 날을 센다.
  const { at: now } = useTheme();
  const searching = query.trim().length > 0;
  const matches = soonestFestivals(
    festivals,
    query,
    now,
    searching ? 8 : more ? 12 : 5,
  );
  return (
    <section className="assistant-picker" aria-label="행사 검색(패널)">
      <label htmlFor="assistant-festival-search">
        다가오는 행사에서 고르기
      </label>
      <input
        id="assistant-festival-search"
        aria-label="다가오는 행사에서 고르기(패널)"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="행사명·지역으로 좁히기"
        autoComplete="off"
      />
      {status === "loading" && (
        <p role="status">행사 목록을 불러오는 중이에요.</p>
      )}
      {status === "error" && (
        <p role="alert">
          행사 목록을 확인할 수 없어요. 설명으로 상담을 시작해 주세요.
        </p>
      )}
      {status === "ready" && (
        <>
          {!searching && (
            <p className="assistant-picker__caption">곧 열리는 행사</p>
          )}
          {matches.length ? (
            <ul className="assistant-picker__results">
              {matches.map((festival) => (
                <li key={festival.eventId}>
                  <button type="button" onClick={() => onPick(festival)}>
                    <span className="assistant-picker__when">
                      {dDayLabel(festival, now)}
                    </span>
                    <strong>{festival.name}</strong>
                    <span>
                      {formatDate(festival.startsAt)} · {festival.sigunguName} ·{" "}
                      <GradeMark level={festival.level} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p>
              {searching
                ? "일치하는 행사가 없어요. 다른 이름이나 지역으로 찾아보세요."
                : "지금 예보된 다가오는 행사가 없어요."}
            </p>
          )}
          {!searching && !more && festivals.length > 5 && (
            <button
              type="button"
              className="assistant-picker__more"
              onClick={() => setMore(true)}
            >
              더 보기
            </button>
          )}
        </>
      )}
    </section>
  );
}
