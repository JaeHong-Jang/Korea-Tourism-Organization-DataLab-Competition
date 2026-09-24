// 등급별 주간 행사 건수를 공통 축의 누적 막대와 표로 보여 준다.
import type { FestivalSummary } from "@crowdcast/contracts/types";
import { koreanDay } from "../../lib/festivals/filter-festivals";

type Week = { start: string; counts: number[]; total: number };

// 한국 날짜의 월요일을 주간 묶음 키로 사용한다.
export function weeklyCounts(festivals: FestivalSummary[]): Week[] {
  const weeks = new Map<string, Week>();
  for (const festival of festivals) {
    const day = koreanDay(festival.startsAt);
    const monday = new Date(`${day}T12:00:00+09:00`);
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    const start = koreanDay(monday);
    const week = weeks.get(start) ?? { start, counts: [0, 0, 0, 0], total: 0 };
    week.counts[festival.level - 1] += 1;
    week.total += 1;
    weeks.set(start, week);
  }
  return [...weeks.values()].sort((a, b) => a.start.localeCompare(b.start));
}

// 막대와 표가 동일한 주간 수를 공유하고 등급 의미를 글자로도 명시한다.
export function WeeklyTimeline({
  festivals,
  status = "ready",
}: {
  festivals: FestivalSummary[];
  status?: string;
}) {
  if (status === "loading")
    return <p role="status">주간 흐름을 불러오는 중이에요.</p>;
  if (status === "error")
    return <p role="alert">주간 흐름을 확인할 수 없어요.</p>;
  const weeks = weeklyCounts(festivals);
  const max = Math.max(1, ...weeks.map((week) => week.total));
  const labels = ["소규모", "수립 권고", "수립 대상", "대규모"];
  return (
    <details className="weekly-timeline">
      <summary>주간 타임라인 펼치기</summary>
      <div className="weekly-timeline__legend">
        {labels.map((label, index) => (
          <span
            key={label}
            className={`weekly-timeline__level weekly-timeline__level--${index + 1}`}
          >
            <i aria-hidden="true" />
            {index + 1}등급 {label}
          </span>
        ))}
      </div>
      {weeks.length === 0 ? (
        <p>표시할 주간 행사가 없어요.</p>
      ) : (
        <div
          className="weekly-timeline__weeks"
          role="img"
          aria-label="등급별 주간 누적 행사 수"
        >
          {weeks.map((week) => (
            <div className="weekly-timeline__week" key={week.start}>
              <span>{week.start.slice(5)} 주</span>
              <div
                className="weekly-timeline__bar"
                role="img"
                aria-label={`${week.start} 주 ${week.total}건`}
              >
                {week.counts.map(
                  (count, index) =>
                    count > 0 && (
                      <span
                        key={labels[index]}
                        className={`weekly-timeline__segment weekly-timeline__segment--${index + 1}`}
                        style={{ width: `${(count / max) * 100}%` }}
                        title={`${labels[index]} ${count}건`}
                      />
                    ),
                )}
              </div>
              <strong>{week.total}건</strong>
            </div>
          ))}
        </div>
      )}
      <details className="weekly-timeline__table">
        <summary>표 보기</summary>
        <table>
          <caption className="sr-only">등급별 주간 행사 수</caption>
          <thead>
            <tr>
              <th scope="col">주 시작</th>
              {labels.map((label, index) => (
                <th scope="col" key={label}>
                  {index + 1}등급 {label}
                </th>
              ))}
              <th scope="col">합계</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((week) => (
              <tr key={week.start}>
                <th scope="row">{week.start}</th>
                {week.counts.map((count, index) => (
                  <td key={labels[index]}>{count}건</td>
                ))}
                <td>{week.total}건</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </details>
  );
}
