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
    const panels = page
      ? Array.from(
          page.querySelectorAll<HTMLElement>(
            ".scene-left-rail, .scene-list, .scene-timeline, .scene-cta, .scene-overview",
          ),
        )
      : [];
    const listeners = new Set<(bounds: PanelBounds) => void>();
    const measure = () => {
      const rect = stage.getBoundingClientRect();
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
    observer.observe(stage);
    for (const panel of panels) observer.observe(panel);
    cache = {
      value: { width: 0, height: 0, blockers: [] },
      listeners,
      observer,
    };
    caches.set(stage, cache);
    measure();
  }
  cache.listeners.add(listener);
  listener(cache.value);
  return () => {
    cache.listeners.delete(listener);
    if (cache.listeners.size === 0) {
      cache.observer.disconnect();
      caches.delete(stage);
    }
  };
}
