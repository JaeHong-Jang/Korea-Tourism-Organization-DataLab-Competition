// 군중 축척과 네 등급의 의미를 장면 위에 항상 표시한다.
import { GradeMark } from "./grade-mark";
import { HonestNote } from "./honest-note";
import "./scene-legend.css";

// 참고 문구를 기존 HonestNote와 합쳐 같은 자리에서 한 번만 읽히게 한다.
export function SceneLegend({ peoplePerDoll }: { peoplePerDoll: number }) {
  return (
    <div className="scene-stage__note scene-legend">
      <div className="scene-legend__scale">
        인형 1개 = {peoplePerDoll.toLocaleString("ko-KR")}명
      </div>
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
    </div>
  );
}
