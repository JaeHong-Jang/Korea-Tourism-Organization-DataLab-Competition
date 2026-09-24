// 행사 초안의 채운 값과 누락 값을 칩으로 보여 주고 수정 입력을 연다.
import type { EventDraft } from "@crowdcast/contracts/types";
import { useState } from "react";
import { Button } from "../../components/ui/button";

const fields: { key: keyof EventDraft; label: string }[] = [
  { key: "name", label: "행사명" },
  { key: "type", label: "유형" },
  { key: "startsAt", label: "시작" },
  { key: "endsAt", label: "종료" },
  { key: "venueText", label: "장소" },
  { key: "fee", label: "요금" },
  { key: "hostType", label: "주최" },
  { key: "hazards", label: "위험요소" },
];

// 필드 칩 선택 뒤 수정 내용을 새 메시지의 원문과 답 객체로 함께 보낸다.
export function EventDraftCard({
  draft,
  onEdit,
  disabled,
}: {
  draft: EventDraft | null;
  onEdit: (message: { text: string; answer: object }) => void;
  disabled: boolean;
}) {
  const [editing, setEditing] = useState<keyof EventDraft | null>(null);
  const [value, setValue] = useState("");
  if (!draft)
    return (
      <p className="consult-muted">
        행사 내용을 보내면 확인한 항목이 여기에 모여요.
      </p>
    );
  return (
    <div>
      <div className="consult-field-list">
        {fields.map(({ key, label }) => {
          const raw = draft[key];
          const shown = Array.isArray(raw)
            ? raw.join(", ")
            : raw == null
              ? ""
              : String(raw);
          return (
            <button
              type="button"
              key={key}
              className={`consult-field${shown ? "" : " consult-field--missing"}`}
              disabled={disabled}
              onClick={() => {
                setEditing(key);
                setValue(shown);
              }}
            >
              <strong>{label}</strong> {shown || "확인 필요"}
            </button>
          );
        })}
      </div>
      {editing && (
        <form
          className="consult-edit"
          onSubmit={(event) => {
            event.preventDefault();
            if (!value.trim()) return;
            onEdit({
              text: `${fields.find((field) => field.key === editing)?.label}: ${value}`,
              answer: {
                [editing]:
                  editing === "hazards"
                    ? value.split(",").map((part) => part.trim())
                    : value,
              },
            });
            setEditing(null);
          }}
        >
          <label>
            {fields.find((field) => field.key === editing)?.label} 수정
            <input
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </label>
          <Button type="submit" variant="outline">
            수정 보내기
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setEditing(null)}
          >
            닫기
          </Button>
        </form>
      )}
    </div>
  );
}
