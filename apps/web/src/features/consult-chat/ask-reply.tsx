// 질문 종류에 맞는 버튼과 시간 입력으로 같은 상담에 답을 보낸다.
import type { EventDraft } from "@crowdcast/contracts/types";
import { useState } from "react";
import { Button } from "../../components/ui/button";
import { type Ask, choiceAnswer, hazardsAnswer, timeAnswer } from "./answers";

type Reply = { text: string; answer: object };

// 위험요소는 여러 개를 고른 뒤 보내고 해당 없음은 즉시 빈 배열로 확정한다.
export function AskReply({
  ask,
  draft,
  onReply,
  disabled,
}: {
  ask: Ask;
  draft: EventDraft | null;
  onReply: (reply: Reply) => void;
  disabled: boolean;
}) {
  const [hazards, setHazards] = useState<EventDraft["hazards"]>([]);
  const [date, setDate] = useState(draft?.startsAt?.slice(0, 10) ?? "");
  const [start, setStart] = useState(draft?.startsAt?.slice(11, 16) ?? "18:00");
  const [end, setEnd] = useState(draft?.endsAt?.slice(11, 16) ?? "21:00");
  return (
    <fieldset className="consult-ask" aria-label="되묻기">
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
          <Button
            type="button"
            variant="outline"
            disabled={disabled || !date || !start || !end}
            onClick={() => onReply(timeAnswer(date, start, end))}
          >
            시각 확인
          </Button>
        </div>
      ) : ask.field === "hazards" ? (
        <div className="consult-choices">
          {ask.options
            .filter((option) => option.value !== "[]")
            .map((option) => (
              <label key={option.value} className="consult-choice">
                <input
                  type="checkbox"
                  checked={hazards.includes(
                    option.value as EventDraft["hazards"][number],
                  )}
                  onChange={(event) =>
                    setHazards((current) =>
                      event.target.checked
                        ? [
                            ...current,
                            option.value as EventDraft["hazards"][number],
                          ]
                        : current.filter((value) => value !== option.value),
                    )
                  }
                />
                {option.label}
              </label>
            ))}
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => onReply(hazardsAnswer(hazards))}
          >
            선택 확인
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={disabled}
            onClick={() => onReply(hazardsAnswer([]))}
          >
            해당 없어요
          </Button>
        </div>
      ) : (
        <div className="consult-choices">
          {(ask.field === "hostType" && !ask.options.length
            ? ["지자체", "민간", "대학", "기타"].map((value) => ({
                label: value,
                value,
              }))
            : ask.options
          ).map((option) => (
            <Button
              key={option.value}
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => onReply(choiceAnswer(ask.field, option.value))}
            >
              {option.label}
            </Button>
          ))}
        </div>
      )}
    </fieldset>
  );
}
