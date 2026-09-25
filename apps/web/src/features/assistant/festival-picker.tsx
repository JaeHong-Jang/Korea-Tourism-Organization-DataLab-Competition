// 행사 이름·지역·날짜로 검증된 목록을 찾아 상담을 시작한다.
import type { FestivalSummary } from "@crowdcast/contracts/types";
import { useEffect, useState } from "react";
import { getFestivals } from "../../lib/api-client";
import { formatDate } from "../../lib/format";

// 두 글자 이상일 때만 제안을 보여 검색 전 목록을 읽기 쉽게 둔다.
export function FestivalPicker({
  onPick,
}: {
  onPick: (festival: FestivalSummary) => void;
}) {
  const [query, setQuery] = useState("");
  const [festivals, setFestivals] = useState<FestivalSummary[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  // 목록은 한 번만 읽고 스키마 검증에 실패하면 선택을 막는다.
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

  const matches =
    query.trim().length >= 2
      ? festivals
          .filter((item) =>
            `${item.name} ${item.sigunguName} ${formatDate(item.startsAt)} ${item.startsAt.slice(0, 10)}`
              .toLocaleLowerCase("ko-KR")
              .includes(query.trim().toLocaleLowerCase("ko-KR")),
          )
          .slice(0, 8)
      : [];
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
        placeholder="행사명·지역·날짜 검색"
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
      {status === "ready" &&
        query.trim().length >= 2 &&
        (matches.length ? (
          <ul className="assistant-picker__results">
            {matches.map((festival) => (
              <li key={festival.eventId}>
                <button type="button" onClick={() => onPick(festival)}>
                  <strong>{festival.name}</strong>
                  <span>
                    {formatDate(festival.startsAt)} · {festival.sigunguName}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p>일치하는 행사가 없어요. 다른 이름이나 지역으로 찾아보세요.</p>
        ))}
    </section>
  );
}
