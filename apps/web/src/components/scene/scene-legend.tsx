// 군중 축척과 등급, 접근 가능한 행사 목록을 항상 같은 자리에서 제공한다.
import type { FestivalSummary } from "@crowdcast/contracts/types";
import type { ReactNode } from "react";
import { FestivalList } from "./festival-list";
import { GradeMark } from "./grade-mark";
import { HonestNote } from "./honest-note";
import "./scene-legend.css";

// 참고 문구와 목록 진입점을 Canvas 성공 여부와 관계없이 유지한다.
export function SceneLegend({
  peoplePerDoll,
  capExceeded,
  festivals,
  dataMode = false,
  controls,
  notices,
}: {
  peoplePerDoll: number;
  capExceeded: boolean;
  festivals: FestivalSummary[];
  dataMode?: boolean;
  controls?: ReactNode;
  notices?: ReactNode;
}) {
  return (
    <div className="scene-stage__note scene-legend">
      <div className="scene-legend__scale">
        {dataMode && <>타일 색·높이 = 기간 안 예보 순간 최대(p50) 합 · </>}인형
        1개 = {peoplePerDoll.toLocaleString("ko-KR")}명
      </div>
      {controls}
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
      <HonestNote />
      {notices}
      <FestivalList festivals={festivals} />
    </div>
  );
}
