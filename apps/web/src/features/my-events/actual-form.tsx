// 지난 행사에 한해 실측 인원과 관측 방식·범위를 받아 저장한다.
import type { Event } from "@crowdcast/contracts/types";
import { useState } from "react";
import { postActual } from "../../lib/my-events-api";

// 양수와 인원 단위를 확인하고 공통 quantity 계약의 필드를 구성한다.
export function actualQuantity(
  event: Event,
  metric: "daily" | "peak",
  raw: string,
  source: "관측" | "사후집계",
  scope: "행사장" | "행정동" | "시군구",
) {
  const value = Number(raw);
  if (!raw.trim() || !Number.isFinite(value) || value <= 0)
    throw new Error("실측 인원을 0보다 큰 숫자로 입력해 주세요.");
  return {
    id: `q-${event.id.slice(2)}-${Date.now()}`,
    name: metric === "daily" ? "실측 일평균" : "실측 순간 최대",
    value,
    p10: null,
    p50: null,
    p90: null,
    unit: metric === "daily" ? ("명/일" as const) : ("명" as const),
    timeUnit: metric === "daily" ? ("일" as const) : ("순간" as const),
    spatialScope: scope,
    valueKind: source,
    estimated: false,
    assumptionIds: [],
    announcedAt: new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()),
  };
}

// 저장 후에는 계약이 점수를 주지 않으므로 검증 센터 링크를 안내한다.
export function ActualForm({
  event,
  onSaved,
}: {
  event: Event;
  onSaved: () => void;
}) {
  const [metric, setMetric] = useState<"daily" | "peak">("daily");
  const [value, setValue] = useState("");
  const [source, setSource] = useState<"관측" | "사후집계">("관측");
  const [scope, setScope] = useState<"행사장" | "행정동" | "시군구">("행사장");
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState("");
  return (
    <form
      className="my-events-actual-form"
      onSubmit={async (submit) => {
        submit.preventDefault();
        if (state === "saving") return;
        try {
          const quantity = actualQuantity(event, metric, value, source, scope);
          setError("");
          setState("saving");
          await postActual(event.id, quantity);
          setState("saved");
          onSaved();
        } catch (reason) {
          setState("idle");
          setError(
            reason instanceof Error
              ? reason.message
              : "실측을 저장하지 못했어요.",
          );
        }
      }}
    >
      <label>
        실측 항목{" "}
        <select
          value={metric}
          onChange={(change) =>
            setMetric(change.target.value as "daily" | "peak")
          }
        >
          <option value="daily">일평균 (명/일)</option>
          <option value="peak">순간 최대 (명)</option>
        </select>
      </label>
      <label>
        인원{" "}
        <input
          type="number"
          min="0.01"
          step="any"
          inputMode="decimal"
          value={value}
          onChange={(change) => setValue(change.target.value)}
          aria-invalid={Boolean(error)}
          required
        />
      </label>
      <label>
        출처{" "}
        <select
          value={source}
          onChange={(change) =>
            setSource(change.target.value as "관측" | "사후집계")
          }
        >
          <option value="관측">현장 관측</option>
          <option value="사후집계">사후 집계</option>
        </select>
      </label>
      <label>
        범위{" "}
        <select
          value={scope}
          onChange={(change) =>
            setScope(change.target.value as "행사장" | "행정동" | "시군구")
          }
        >
          <option>행사장</option>
          <option>행정동</option>
          <option>시군구</option>
        </select>
      </label>
      <button type="submit" disabled={state === "saving"}>
        {state === "saving" ? "저장 중…" : "실측 저장"}
      </button>
      {error && <p role="alert">{error}</p>}
      {state === "saved" && (
        <p role="status">
          실측을 저장했어요. 채점은 <a href="/validation">검증 센터에서</a>{" "}
          확인해 주세요.
        </p>
      )}
    </form>
  );
}
