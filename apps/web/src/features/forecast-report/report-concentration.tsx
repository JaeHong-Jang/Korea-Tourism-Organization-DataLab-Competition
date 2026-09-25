// 행사 기간 시군구 관광지 집중률 예측(한국관광공사)을 참고 근거로 보여 준다 — 인원 예보에는 쓰지 않았다.
import type { ForecastReport } from "@crowdcast/contracts/types";
import { koreaDate, useConcentration } from "../../lib/use-concentration";

// 행사 기간 평균을 30일 평균과 견줘 한 문장으로 말한다(±5 안은 비슷하다고 본다).
export function compareToWindow(eventMean: number, windowMean: number) {
  const gap = Math.round((eventMean - windowMean) * 10) / 10;
  if (Math.abs(gap) < 5) return "30일 평균과 비슷해요";
  return gap > 0
    ? `30일 평균보다 ${gap} 높아요`
    : `30일 평균보다 ${-gap} 낮아요`;
}

const dayLabel = (value: string) =>
  `${Number(value.slice(5, 7))}/${Number(value.slice(8, 10))}`;

export function ReportConcentration({ report }: { report: ForecastReport }) {
  const { event } = report;
  const state = useConcentration(
    event.sigunguCode,
    event.startsAt,
    event.endsAt,
  );
  return (
    <section
      className="report-section report-concentration"
      aria-labelledby="report-concentration-title"
    >
      <h3 id="report-concentration-title">주변 관광지 붐빔 예측</h3>
      {state.status === "loading" && (
        <p>관광지 집중률 예측을 불러오는 중이에요.</p>
      )}
      {state.status === "error" && (
        <p role="status">
          지금은 관광지 집중률 예측을 불러오지 못했어요. 잠시 뒤 다시 열어
          주세요.
        </p>
      )}
      {state.status === "ready" && state.value.status === "empty" && (
        <p>{event.sigunguName}에는 관광지 집중률 예측이 없어요.</p>
      )}
      {state.status === "ready" && state.value.status === "out_of_window" && (
        <p>
          행사일이 예측 범위(
          {state.value.windowFrom && dayLabel(state.value.windowFrom)}~
          {state.value.windowTo && dayLabel(state.value.windowTo)}, 조회일부터
          30일) 밖이라 아직 볼 수 없어요.
        </p>
      )}
      {state.status === "ready" &&
        state.value.status === "ok" &&
        state.value.eventMean !== null && (
          <>
            <p>
              {event.sigunguName} 관광지 {state.value.attractions}곳의 행사 기간
              평균 집중률은 <strong>{state.value.eventMean}</strong>
              {state.value.windowMean !== null &&
                ` — ${compareToWindow(state.value.eventMean, state.value.windowMean)}`}
              .
            </p>
            <ul className="report-concentration__days">
              {state.value.days.slice(0, 7).map((day) => (
                <li key={day.date}>
                  {dayLabel(day.date)} 평균 {Math.round(day.mean)} · 최고{" "}
                  {Math.round(day.max)}
                </li>
              ))}
            </ul>
            {state.value.top.length > 0 && (
              <p>
                붐빌 곳:{" "}
                {state.value.top
                  .slice(0, 3)
                  .map((item) => `${item.name} ${Math.round(item.rate)}`)
                  .join(" · ")}
              </p>
            )}
          </>
        )}
      <small>
        한국관광공사 관광지 집중률 방문자 추이 예측(데이터랩 15128555) ·
        최성수기 = 100인 상대치 · 예보서 발행 뒤 받아 온 실시간 참고
        {state.status === "ready" && state.value.fetchedAt
          ? `(수집 ${koreaDate(state.value.fetchedAt).slice(5).replace("-", "/")})`
          : ""}
        이며 행사 인원 예보에는 쓰지 않았어요
      </small>
    </section>
  );
}
