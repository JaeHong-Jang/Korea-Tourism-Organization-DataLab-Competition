// 지도부터 근거 그래프까지 화면 요소를 가리키며 사용법을 안내한다.
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAssistantStore } from "../../lib/consult-store";

const steps = [
  {
    title: "지도에서 행사 보기",
    text: "지도에서 지역과 행사를 살펴보세요.",
    path: "/",
    target: ".scene-stage",
  },
  {
    title: "목록에서 행사 고르기",
    text: "목록에서 관심 있는 행사를 고르면 상담으로 이어져요.",
    path: "/",
    target: ".scene-list",
  },
  {
    title: "예보 받기",
    text: "행사를 설명하면 예보팀 작업과 숫자 예보가 여기에 나타나요.",
    path: "/consult",
    target: ".report-preview",
  },
  {
    title: "고래와 대화하기",
    text: "대화창에서 질문하고 예보팀이 일하는 모습을 확인하세요.",
    path: "/consult",
    target: ".assistant-panel",
  },
  {
    title: "근거 그래프 보기",
    text: "근거 그래프 메뉴에서 예보의 근거 관계를 살펴보세요.",
    path: "/graph",
    target: '.main-nav__link[href="/graph"]',
  },
] as const;

// 현재 안내의 화면을 열고 강조 대상의 위치를 창 크기에 맞춰 갱신한다.
export function AssistantGuide({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const openPanel = useAssistantStore((state) => state.openPanel);
  const closePanel = useAssistantStore((state) => state.closePanel);
  const current = steps[index];

  // 단계의 대상이 상담창이면 열고 다른 화면에서는 내용을 볼 수 있게 닫는다.
  useEffect(() => {
    if (location.pathname !== current.path) navigate(current.path);
    if (index === 3) openPanel();
    else closePanel();
  }, [index, current.path, location.pathname, navigate, openPanel, closePanel]);

  // 페이지 전환과 크기 변경 뒤 대상 주위를 강조하고 그 자리로 스크롤한다.
  useEffect(() => {
    let frame = 0;
    if (location.pathname !== current.path) {
      setRect(null);
      return;
    }
    const locate = () => {
      const target = document.querySelector<HTMLElement>(current.target);
      if (!target) {
        setRect(null);
        return;
      }
      setRect(target.getBoundingClientRect());
    };
    frame = requestAnimationFrame(() => {
      if (index === 2)
        document
          .querySelector<HTMLElement>(current.target)
          ?.scrollIntoView({ block: "center" });
      locate();
    });
    window.addEventListener("resize", locate);
    window.addEventListener("scroll", locate, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", locate);
      window.removeEventListener("scroll", locate, true);
    };
  }, [index, location.pathname, current.target, current.path]);

  return (
    <div
      className="assistant-guide"
      role="dialog"
      aria-label="인파예보 사용법"
      aria-modal="false"
    >
      {rect && (
        <span
          className="assistant-guide__target"
          aria-hidden="true"
          style={{
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
          }}
        />
      )}
      <section className="assistant-guide__card">
        <p>
          사용법 {index + 1} / {steps.length}
        </p>
        <h2>{current.title}</h2>
        <p>{current.text}</p>
        <div className="assistant-guide__actions">
          <button type="button" onClick={onClose}>
            닫기
          </button>
          {index > 0 && (
            <button type="button" onClick={() => setIndex(index - 1)}>
              이전
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              index === steps.length - 1 ? onClose() : setIndex(index + 1)
            }
          >
            {index === steps.length - 1 ? "마치기" : "다음"}
          </button>
        </div>
      </section>
    </div>
  );
}
