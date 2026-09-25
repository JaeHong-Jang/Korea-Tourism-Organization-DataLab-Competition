// 실제 지도·미니어처·SVG 선택을 URL과 기존 브라우저 키에서 복원한다.
const KEY = "crowdcast:scene:view";
export type MapView = "map" | "top" | "miniature" | "svg";

// 예전 3D는 미니어처, 2D는 위에서 보기로 해석해 저장된 선택을 지킨다.
function normalize(value: string | null): MapView | null {
  if (value === "3d") return "miniature";
  if (value === "2d") return "top";
  if (
    value === "map" ||
    value === "top" ||
    value === "miniature" ||
    value === "svg"
  )
    return value;
  return null;
}

// 주소의 명시적 선택이 저장값보다 우선한다.
export function preferredView(search: string): MapView {
  const query = new URLSearchParams(search);
  if (query.get("forceSvg") === "1") return "svg";
  const requested = normalize(query.get("view"));
  if (requested) return requested;
  try {
    return normalize(window.localStorage.getItem(KEY)) ?? "map";
  } catch {
    return "map";
  }
}

// 저장소가 차단되어도 현재 화면 선택은 유지한다.
export function rememberView(view: MapView) {
  try {
    window.localStorage.setItem(KEY, view);
  } catch {
    // 저장 실패는 현재 탭의 보기 전환을 막지 않는다.
  }
}
