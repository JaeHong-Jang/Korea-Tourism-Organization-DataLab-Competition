// 상담 메시지 입력과 중단 버튼을 별도 입력 영역에 둔다.
import { Button } from "../../components/ui/button";

// 질문에 답하는 동안에는 본문 입력을 잠시 잠근다.
export function ConsultInput({
  text,
  onText,
  busy,
  answering,
  onSubmit,
  onStop,
  canSubmit,
}: {
  text: string;
  onText: (value: string) => void;
  busy: boolean;
  answering: boolean;
  onSubmit: () => void;
  onStop: () => void;
  canSubmit?: boolean;
}) {
  return (
    <form
      className="consult-compose"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label htmlFor="consult-text">
        {answering ? "답을 입력해 주세요" : "행사를 설명해 주세요"}
      </label>
      <textarea
        id="consult-text"
        value={text}
        onChange={(event) => onText(event.target.value)}
        rows={3}
        placeholder={
          answering
            ? "선택하거나 여기에 직접 답해 주세요"
            : "행사 날짜, 장소, 종류를 적어 주세요"
        }
        disabled={busy}
      />
      <div className="consult-compose__actions">
        <Button
          type="submit"
          disabled={busy || !(canSubmit ?? Boolean(text.trim()))}
        >
          보내기
        </Button>
        {busy && (
          <Button type="button" variant="outline" onClick={onStop}>
            중단
          </Button>
        )}
      </div>
    </form>
  );
}
