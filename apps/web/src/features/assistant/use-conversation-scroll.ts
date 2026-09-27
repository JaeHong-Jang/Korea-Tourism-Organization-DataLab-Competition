// 새 요청은 대화 끝으로 이동하고 이전 내용을 읽는 동안에는 자동 이동을 멈춘다.
import { useLayoutEffect, useRef } from "react";

// 응답과 이미지의 높이가 바뀌어도 최신 대화를 보고 있으면 아래쪽을 유지한다.
export function useConversationScroll(requestId: string | undefined) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const follow = useRef(true);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;
    const onScroll = () => {
      follow.current =
        viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop < 48;
    };
    const observer = new ResizeObserver(() => {
      if (follow.current) viewport.scrollTop = viewport.scrollHeight;
    });
    observer.observe(content);
    observer.observe(viewport);
    viewport.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      observer.disconnect();
      viewport.removeEventListener("scroll", onScroll);
    };
  }, []);

  useLayoutEffect(() => {
    if (!requestId) return;
    follow.current = true;
    const viewport = viewportRef.current;
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [requestId]);

  return { viewportRef, contentRef };
}
