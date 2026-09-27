// 상담 메시지 입력과 버튼(오른쪽 정렬, 보내기가 맨 끝)을 별도 입력 영역에 둔다.
import { Button } from "../../components/ui/button";
import { type InputContext, inputGuidance } from "./input-guidance";

// 질문에 답하는 동안에는 본문 입력을 잠시 잠근다.
export function ConsultInput({
  text,
  onText,
  busy,
  answering,
  onSubmit,
  onStop,
  onNear,
  canSubmit,
  context = "initial",
}: {
  text: string;
  onText: (value: string) => void;
  busy: boolean;
  answering: boolean;
  onSubmit: () => void;
  onStop: () => void;
  onNear?: () => void;
  canSubmit?: boolean;
  context?: InputContext;
}) {
  const guidance = inputGuidance(busy, answering, context);
  return (
    <form
      className="consult-compose"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {/* 같은 말이 두 번 보이지 않게 이름표는 화면 읽기 도구에만 남기고 안내는 입력칸 안에 둔다. */}
      <label htmlFor="consult-text" className="sr-only">
        {guidance.label}
      </label>
      <textarea
        id="consult-text"
        value={text}
        onChange={(event) => onText(event.target.value)}
        rows={3}
        placeholder={guidance.placeholder}
        disabled={busy}
      />
      <div className="consult-compose__actions">
        {onNear && (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onNear}
          >
            내 위치로 가까운 축제
          </Button>
        )}
        {busy && (
          <Button type="button" variant="outline" onClick={onStop}>
            중단
          </Button>
        )}
        <Button
          type="submit"
          disabled={busy || !(canSubmit ?? Boolean(text.trim()))}
        >
          보내기
        </Button>
      </div>
    </form>
  );
}
