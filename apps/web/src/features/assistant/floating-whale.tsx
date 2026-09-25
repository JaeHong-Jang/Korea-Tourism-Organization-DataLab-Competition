// 사용자가 준 고래 그림을 상태가 보이는 이동식 상담 버튼으로 띄운다.
import {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  clampWhale,
  dragWhale,
  nudgeWhale,
  rememberWhale,
  restoreWhale,
  type WhalePoint,
} from "./whale-position";

const size = { width: 92, height: 100 };

// 끌기와 누르기를 구분하고 키보드 위치 변경도 저장한다.
export function FloatingWhale({
  working,
  published,
  onClick,
  onMoved,
  panelOpen,
}: {
  working: boolean;
  published: boolean;
  onClick: () => void;
  onMoved?: () => void;
  panelOpen: boolean;
}) {
  const [position, setPosition] = useState<WhalePoint>(() =>
    restoreWhale(size),
  );
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{
    id: number;
    pointer: WhalePoint;
    origin: WhalePoint;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);

  // 창 크기가 바뀌면 저장 위치도 새 화면 안으로 돌려놓는다.
  useEffect(() => {
    const resize = () =>
      setPosition((current) => {
        const next = clampWhale(current, size);
        rememberWhale(next);
        return next;
      });
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // 포인터를 잡아 그림 바깥으로 나가도 이동이 이어지게 한다.
  const start = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    drag.current = {
      id: event.pointerId,
      pointer: { x: event.clientX, y: event.clientY },
      origin: position,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  // 짧은 손 떨림은 클릭으로 두고 실제 이동만 고래 위치에 반영한다.
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    const dx = event.clientX - current.pointer.x;
    const dy = event.clientY - current.pointer.y;
    if (!current.moved && Math.hypot(dx, dy) < 6) return;
    current.moved = true;
    setDragging(true);
    setPosition(
      dragWhale(
        current.origin,
        current.pointer,
        { x: event.clientX, y: event.clientY },
        size,
      ),
    );
  };

  // 놓을 때만 위치를 기록하고 이어지는 합성 클릭은 대화 열기로 보지 않는다.
  const finish = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    if (current.moved) {
      const next = dragWhale(
        current.origin,
        current.pointer,
        { x: event.clientX, y: event.clientY },
        size,
      );
      setPosition(next);
      rememberWhale(next);
      onMoved?.();
      suppressClick.current = true;
    }
    drag.current = null;
    setDragging(false);
  };

  // Alt와 화살표를 함께 누르면 포인터 없이도 고래를 옮긴다.
  const moveByKeyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!event.altKey || !event.key.startsWith("Arrow")) return;
    if (
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
    )
      return;
    event.preventDefault();
    setPosition((current) => {
      const next = nudgeWhale(current, event.key, size);
      rememberWhale(next);
      return next;
    });
  };

  return (
    <button
      type="button"
      className={`assistant-whale${dragging ? " assistant-whale--dragging" : ""}`}
      aria-label="고래 봇 대화 열기"
      aria-hidden={panelOpen}
      tabIndex={panelOpen ? -1 : 0}
      title="고래 봇 · 끌어서 옮기기, Alt와 방향키로 이동"
      style={{ left: position.x, top: position.y }}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={finish}
      onPointerCancel={finish}
      onKeyDown={moveByKeyboard}
      onClick={() => {
        if (suppressClick.current) {
          suppressClick.current = false;
          return;
        }
        onClick();
      }}
    >
      <span className="assistant-whale__figure" aria-hidden="true">
        <img src="/assistant/whale.png" alt="" draggable={false} />
      </span>
      <span className="assistant-whale__status" aria-live="polite">
        {working ? (
          <>
            <span className="assistant-whale__dots" aria-hidden="true">
              ···
            </span>{" "}
            작업 중
          </>
        ) : published ? (
          "✓ 발행 완료"
        ) : (
          "대기 중"
        )}
      </span>
    </button>
  );
}
