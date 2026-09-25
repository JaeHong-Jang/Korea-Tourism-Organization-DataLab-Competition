// 떠 있는 패널 경계를 한 번 측정해 이름표와 전국 카메라가 함께 쓴다.
import type { ScreenRect } from "./tag-visibility";

export type PanelBounds = {
  width: number;
  height: number;
  blockers: ScreenRect[];
};

type BoundsCache = {
  value: PanelBounds;
  listeners: Set<(bounds: PanelBounds) => void>;
  observer: ResizeObserver;
  changes: MutationObserver;
  cleanup: () => void;
};

const caches = new WeakMap<HTMLElement, BoundsCache>();

// 같은 장면의 구독자가 늘어도 ResizeObserver는 하나만 유지한다.
export function observePanelBounds(
  stage: HTMLElement,
  listener: (bounds: PanelBounds) => void,
): () => void {
  let cache = caches.get(stage);
  if (!cache) {
    const page = stage.closest(".scene-page");
    const scenePanels = page
      ? Array.from(
          page.querySelectorAll<HTMLElement>(
            ".scene-left-rail, .scene-list, .scene-timeline, .scene-cta, .scene-overview",
          ),
        )
      : [];
    const assistant = document.querySelector<HTMLElement>(".assistant-shell");
    const observed = new Set<HTMLElement>();
    const listeners = new Set<(bounds: PanelBounds) => void>();

    // 장면 밖에 포털처럼 붙는 고래와 상담 서랍도 같은 좌표계로 옮긴다.
    const measure = () => {
      const rect = stage.getBoundingClientRect();
      const panels = [
        ...scenePanels,
        ...document.querySelectorAll<HTMLElement>(
          ".assistant-panel, .assistant-whale",
        ),
      ].filter((panel) => panel.getClientRects().length > 0);
      const value = {
        width: rect.width,
        height: rect.height,
        blockers: panels.map((panel) => {
          const box = panel.getBoundingClientRect();
          return {
            left: box.left - rect.left,
            top: box.top - rect.top,
            right: box.right - rect.left,
            bottom: box.bottom - rect.top,
          };
        }),
      };
      const current = caches.get(stage);
      if (current) current.value = value;
      for (const receive of listeners) receive(value);
    };
    const observer = new ResizeObserver(measure);
    const observe = () => {
      for (const panel of [
        stage,
        ...scenePanels,
        ...document.querySelectorAll<HTMLElement>(
          ".assistant-panel, .assistant-whale",
        ),
      ]) {
        if (!observed.has(panel)) {
          observer.observe(panel);
          observed.add(panel);
        }
      }
      measure();
    };
    const changes = new MutationObserver(observe);
    if (assistant)
      changes.observe(assistant, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "style"],
      });
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    cache = {
      value: { width: 0, height: 0, blockers: [] },
      listeners,
      observer,
      changes,
      cleanup: () => {
        window.removeEventListener("resize", measure);
        window.removeEventListener("scroll", measure, true);
      },
    };
    caches.set(stage, cache);
    observe();
  }
  cache.listeners.add(listener);
  listener(cache.value);
  return () => {
    cache.listeners.delete(listener);
    if (cache.listeners.size === 0) {
      cache.observer.disconnect();
      cache.changes.disconnect();
      cache.cleanup();
      caches.delete(stage);
    }
  };
}
