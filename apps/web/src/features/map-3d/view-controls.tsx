// 실제 지도·미니어처·SVG 보기와 같은 지도의 위에서 보기를 전환한다.
import type { MapView } from "../map-2d/view-preference";

// WebGL을 쓸 수 없을 때도 SVG 버튼과 현재 보기 상태를 유지한다.
export function ViewControls({
  view,
  svgMode,
  webglAvailable,
  onChange,
}: {
  view: MapView;
  svgMode: boolean;
  webglAvailable: boolean;
  onChange: (view: MapView) => void;
}) {
  return (
    <>
      <fieldset className="scene-overview scene-view-toggle">
        <legend className="sr-only">장면 보기</legend>
        <button
          type="button"
          aria-pressed={!svgMode && (view === "map" || view === "top")}
          disabled={!webglAvailable}
          onClick={() => onChange("map")}
          title={
            !webglAvailable
              ? "이 기기에서는 3D 보기를 사용할 수 없어요"
              : undefined
          }
        >
          3D 지도
        </button>
        <button
          type="button"
          aria-pressed={!svgMode && view === "miniature"}
          disabled={!webglAvailable}
          onClick={() => onChange("miniature")}
          title={
            !webglAvailable
              ? "이 기기에서는 미니어처 보기를 사용할 수 없어요"
              : undefined
          }
        >
          미니어처
        </button>
        <button
          type="button"
          aria-pressed={svgMode}
          onClick={() => onChange("svg")}
        >
          SVG
        </button>
      </fieldset>
      {!svgMode && view !== "miniature" && (
        <button
          type="button"
          className="scene-overview scene-top-toggle"
          aria-pressed={view === "top"}
          onClick={() => onChange(view === "top" ? "map" : "top")}
        >
          위에서 보기
        </button>
      )}
    </>
  );
}
