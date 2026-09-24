// 여러 되묻기를 한 폼에 모아 게이트웨이에 답 한 번으로 보낸다.
import type { EventDraft } from "@crowdcast/contracts/types";
import { useState } from "react";
import { Button } from "../../components/ui/button";
import { type Ask, askOptions, combinedAnswer } from "./answers";

// 질문별 선택은 전송 전까지 로컬에 보관한다.
export function AskReply({
  asks,
  draft,
  onReply,
  disabled,
  replyError,
}: {
  asks: Ask[];
  draft: EventDraft | null;
  onReply: (reply: { text: string; answer: object }) => void;
  disabled: boolean;
  replyError: string;
}) {
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [hazards, setHazards] = useState<EventDraft["hazards"] | null>(null);
  const [date, setDate] = useState(
    draft?.startsAt?.slice(0, 10) ?? draft?.endsAt?.slice(0, 10) ?? "",
  );
  const [start, setStart] = useState(draft?.startsAt?.slice(11, 16) ?? "19:00");
  const [end, setEnd] = useState(draft?.endsAt?.slice(11, 16) ?? "21:00");
  const [error, setError] = useState("");

  // 질문에서 받은 선택지만 허용하고 시각은 날짜와 함께 검증한다.
  const submit = () => {
    try {
      onReply(combinedAnswer(asks, { choices, hazards, date, start, end }));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "답을 확인해 주세요.");
    }
  };

  return (
    <fieldset className="consult-ask" aria-label="되묻기">
      {asks.map((ask) => (
        <div className="consult-ask__item" key={`${ask.field}-${ask.question}`}>
          <p className="consult-bubble consult-bubble--ask">{ask.question}</p>
          {ask.field === "time" ? (
            <div className="consult-time">
              <label>
                행사 날짜
                <input
                  type="date"
                  value={date}
                  readOnly={Boolean(draft?.startsAt)}
                  onChange={(event) => setDate(event.target.value)}
                />
              </label>
              <label>
                시작 시각
                <input
                  type="time"
                  value={start}
                  onChange={(event) => setStart(event.target.value)}
                />
              </label>
              <label>
                종료 시각
                <input
                  type="time"
                  value={end}
                  onChange={(event) => setEnd(event.target.value)}
                />
              </label>
            </div>
          ) : ask.field === "hazards" ? (
            <div className="consult-choices">
              {ask.options
                .filter((option) => option.value !== "[]")
                .map((option) => (
                  <label className="consult-choice" key={option.value}>
                    <input
                      type="checkbox"
                      checked={
                        hazards?.includes(
                          option.value as EventDraft["hazards"][number],
                        ) ?? false
                      }
                      onChange={(event) =>
                        setHazards((current) =>
                          event.target.checked
                            ? [
                                ...(current ?? []),
                                option.value as EventDraft["hazards"][number],
                              ]
                            : (current ?? []).filter(
                                (value) => value !== option.value,
                              ),
                        )
                      }
                    />
                    {option.label}
                  </label>
                ))}
              <label className="consult-choice">
                <input
                  type="checkbox"
                  checked={hazards?.length === 0}
                  onChange={(event) =>
                    setHazards(event.target.checked ? [] : null)
                  }
                />
                해당 없어요
              </label>
            </div>
          ) : (
            <div className="consult-choices">
              {askOptions(ask).map((option) => (
                <button
                  type="button"
                  aria-pressed={choices[ask.field] === option.value}
                  key={option.value}
                  onClick={() =>
                    setChoices((current) => ({
                      ...current,
                      [ask.field]: option.value,
                    }))
                  }
                >
                  {option.label}
                </button>
              ))}
              {!askOptions(ask).length && (
                <label>
                  직접 입력
                  <input
                    value={choices[ask.field] ?? ""}
                    onChange={(event) =>
                      setChoices((current) => ({
                        ...current,
                        [ask.field]: event.target.value,
                      }))
                    }
                  />
                </label>
              )}
            </div>
          )}
        </div>
      ))}
      {(error || replyError) && <p role="alert">{error || replyError}</p>}
      <Button type="button" disabled={disabled} onClick={submit}>
        답하기
      </Button>
    </fieldset>
  );
}
