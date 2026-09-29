// 상세 패널이 페이지 스크롤을 부드럽게 따라오되 목록 영역 밖으로는 나가지 않게 한다.
import { type RefObject, useEffect, useLayoutEffect } from "react";

const GAP = 16;
const SINGLE_COLUMN = "(max-width: 1100px)";

// 브라우저에서는 그리기 전에 위치를 잡아 새 패널이 한 프레임도 맨 위에 보이지 않게 한다.
const useBeforePaint =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

// 패널 위치는 목록 영역 위쪽에서 벗어난 만큼 내리고, 영역 바닥을 넘지 않게 자른다.
export function followOffset(
  layoutTop: number,
  layoutHeight: number,
  panelHeight: number,
): number {
  const room = Math.max(layoutHeight - panelHeight, 0);
  return Math.round(Math.min(Math.max(-layoutTop + GAP, 0), room));
}

// 스크롤마다 한 프레임에 한 번만 계산하고, 한 열 화면에서는 따라오기를 끈다.
export function useFollowScroll(ref: RefObject<HTMLElement | null>) {
  useBeforePaint(() => {
    const panel = ref.current;
    const layout = panel?.parentElement;
    if (!panel || !layout) return;
    const single = window.matchMedia?.(SINGLE_COLUMN);
    let frame = 0;
    const update = () => {
      frame = 0;
      if (single?.matches) {
        panel.style.transform = "";
        return;
      }
      const offset = followOffset(
        layout.getBoundingClientRect().top,
        layout.offsetHeight,
        panel.offsetHeight,
      );
      panel.style.transform = offset ? `translateY(${offset}px)` : "";
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    // 행사를 바꿔 패널이 새로 나타날 때는 위에서 내려오지 않게 전환 없이 제자리에 놓는다.
    panel.style.transition = "none";
    update();
    panel.getBoundingClientRect();
    panel.style.transition = "";
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    single?.addEventListener?.("change", schedule);
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(schedule);
    observer?.observe(layout);
    observer?.observe(panel);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      single?.removeEventListener?.("change", schedule);
      observer?.disconnect();
      panel.style.transform = "";
    };
  }, [ref]);
}
