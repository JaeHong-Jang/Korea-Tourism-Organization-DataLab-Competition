// 3D·2D 보기 선택을 URL과 브라우저 저장소에서 복원한다.
const KEY = "crowdcast:scene:view";

// 주소의 명시적 선택이 저장값보다 우선한다.
export function preferredView(search: string): "3d" | "2d" {
  const requested = new URLSearchParams(search).get("view");
  if (requested === "2d") return "2d";
  if (requested === "3d") return "3d";
  try {
    return window.localStorage.getItem(KEY) === "2d" ? "2d" : "3d";
  } catch {
    return "3d";
  }
}

// 저장소가 차단되어도 현재 화면 선택은 유지한다.
export function rememberView(view: "3d" | "2d") {
  try {
    window.localStorage.setItem(KEY, view);
  } catch {
    // 저장 실패는 현재 탭의 보기 전환을 막지 않는다.
  }
}
