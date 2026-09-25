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
}: {
  text: string;
  onText: (value: string) => void;
  busy: boolean;
  answering: boolean;
  onSubmit: () => void;
  onStop: () => void;
}) {
  return (
    <form
      className="consult-compose"
      onSubmit={(event) => {
        event.preventDefault();
        if (!answering) onSubmit();
      }}
    >
      <label htmlFor="consult-text">행사를 설명해 주세요</label>
      <textarea
        id="consult-text"
        value={text}
        onChange={(event) => onText(event.target.value)}
        rows={3}
        placeholder="행사 날짜, 장소, 종류를 적어 주세요"
        disabled={busy || answering}
      />
      <div className="consult-compose__actions">
        <Button type="submit" disabled={busy || answering || !text.trim()}>
          보내기
        </Button>
        {busy && (
          <Button type="button" variant="outline" onClick={onStop}>
            중단
          </Button>
        )}
      </div>
      {answering && <p className="consult-muted">위 질문에 답해 주세요.</p>}
    </form>
  );
}
