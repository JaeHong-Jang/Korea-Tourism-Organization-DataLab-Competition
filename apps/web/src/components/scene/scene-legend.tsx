// 군중 축척과 등급, 접근 가능한 행사 목록을 항상 같은 자리에서 제공한다.
import type { FestivalSummary } from "@crowdcast/contracts/types";
import type { ReactNode } from "react";
import { tileRanges } from "../../features/mini-korea/data-mode";
import { FestivalList } from "./festival-list";
import { GradeMark } from "./grade-mark";
import "./scene-legend.css";

// 참고 문구와 목록 진입점을 Canvas 성공 여부와 관계없이 유지한다.
export function SceneLegend({
  peoplePerDoll,
  capExceeded,
  festivals,
  dataMode = false,
  totals,
  controls,
  notices,
}: {
  peoplePerDoll: number;
  capExceeded: boolean;
  festivals: FestivalSummary[];
  dataMode?: boolean;
  totals?: Map<string, number>;
  controls?: ReactNode;
  notices?: ReactNode;
}) {
  const maximum = totals ? Math.max(0, ...totals.values()) : 0;
  return (
    <div className="scene-stage__note scene-legend">
      <div className="scene-legend__scale">
        {dataMode && <>타일 색·높이 = 기간 안 예보 순간 최대 중앙값 합 · </>}
        인형 1개 = {peoplePerDoll.toLocaleString("ko-KR")}명
      </div>
      {controls}
      {dataMode && (
        <fieldset className="scene-legend__data">
          <legend className="sr-only">기간 안 예보 인파 구간</legend>
          <span className="scene-legend__data-row">
            <i className="scene-legend__tile scene-legend__tile--empty" />
            예보 없음
          </span>
          {tileRanges(maximum).map(({ step, min, max }) => (
            <span className="scene-legend__data-row" key={step}>
              <i className={`scene-legend__tile scene-legend__tile--${step}`} />
              {min.toLocaleString("ko-KR")}~{max.toLocaleString("ko-KR")}명
            </span>
          ))}
          <span className="scene-legend__note">
            지금 필터 기준으로 다시 나눔
          </span>
        </fieldset>
      )}
      {capExceeded && (
        <div className="scene-legend__note">행사가 많아 일부는 1개로 표시</div>
      )}
      <div className="scene-legend__grades">
        {[1, 2, 3, 4].map((level) => (
          <span className="scene-legend__grade" key={level}>
            <span
              className="scene-legend__flag"
              style={{ background: `var(--level-${level})` }}
            />
            <GradeMark level={level} />
          </span>
        ))}
      </div>
      <span className="scene-legend__note">
        인원 규모는 예보값 비례 · 인형 위치는 실제 사람 위치가 아니에요 · 날씨
        효과 = 기상청 예보 기반 연출 ·
        {dataMode
          ? "데이터 모드에서는 열차·차량을 숨겨요 · 인형 움직임은 연출이에요."
          : "열차·차량·인형 움직임은 연출 — 실제 운행·교통량이 아니에요."}
      </span>
      {notices}
      <FestivalList festivals={festivals} />
    </div>
  );
}
