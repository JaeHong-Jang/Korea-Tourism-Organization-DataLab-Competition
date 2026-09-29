// 지난 행사에 한해 실측 인원과 관측 방식·범위를 받아 저장한다.
import type { Event, ForecastReport } from "@crowdcast/contracts/types";
import { useState } from "react";
import { formatDate, formatSnapshotNumber } from "../../lib/format";
import { postActual } from "../../lib/my-events-api";
import { type ActualComparison, compareActual } from "./actual-comparison";

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

// 실측 입력이 열리는 날(행사 종료일)을 "9월 29일"처럼 적는다.
export const openDay = (value: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
  }).format(new Date(value));

export function actualSubmitLabel(saving: boolean, hasSaved: boolean) {
  if (saving) return "저장 중…";
  return hasSaved ? "실측 수정" : "실측 저장";
}

// 저장한 실측이 예보 범위 안에 들었는지 한 줄로 알려 준다.
function ComparisonResult({ result }: { result: ActualComparison }) {
  if (result.kind === "none") return <p>비교할 예보가 없어요.</p>;
  if (result.kind === "missing")
    return <p>예보에 범위 기록이 없어 비교하지 않았어요.</p>;
  if (result.kind === "scope")
    return (
      <p>예보는 {result.forecastScope} 기준이라 이 실측과 비교하지 않았어요.</p>
    );
  const percent = Math.round(Math.abs(result.ratio) * 100);
  return (
    <div
      className={`my-events-comparison ${result.inRange ? "is-in" : "is-out"}`}
    >
      <strong>
        {result.inRange ? "예측 범위 안에 들었어요" : "예측 범위를 벗어났어요"}
      </strong>
      <p>
        {formatDate(result.publishedAt)} 예보 {formatSnapshotNumber(result.p10)}
        –{formatSnapshotNumber(result.p90)}
        {result.unit} · 중앙값보다 {percent}%{" "}
        {result.ratio >= 0 ? "많았어요" : "적었어요"}
      </p>
    </div>
  );
}

// 저장 직후 행사 전 마지막 예보와 비교해 보여 준다.
export function ActualForm({
  event,
  forecast,
  onSaved,
}: {
  event: Event;
  forecast?: ForecastReport;
  onSaved: () => void;
}) {
  const [metric, setMetric] = useState<"daily" | "peak">("daily");
  const [value, setValue] = useState("");
  const [source, setSource] = useState<"관측" | "사후집계">("관측");
  const [scope, setScope] = useState<"행사장" | "행정동" | "시군구">("행사장");
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [hasSaved, setHasSaved] = useState(false);
  const [error, setError] = useState("");
  const [comparison, setComparison] = useState<ActualComparison | null>(null);
  const available = Date.parse(event.endsAt) < Date.now();
  if (!available) {
    return (
      <div className="my-events-actual-locked" role="status">
        <strong>행사 종료 후 입력할 수 있습니다.</strong>
        <p>오픈 일자: {openDay(event.endsAt)}</p>
      </div>
    );
  }
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
          setComparison(compareActual(forecast, metric, quantity.value, scope));
          setHasSaved(true);
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
          onChange={(change) => {
            setMetric(change.target.value as "daily" | "peak");
            if (state === "saved") setState("idle");
          }}
        >
          <option value="daily">일평균 (명/일)</option>
          <option value="peak">최대 동시 인원 (명)</option>
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
          onChange={(change) => {
            setValue(change.target.value);
            if (state === "saved") setState("idle");
          }}
          aria-invalid={Boolean(error)}
          required
        />
      </label>
      <label>
        출처{" "}
        <select
          value={source}
          onChange={(change) => {
            setSource(change.target.value as "관측" | "사후집계");
            if (state === "saved") setState("idle");
          }}
        >
          <option value="관측">현장 관측</option>
          <option value="사후집계">사후 집계</option>
        </select>
      </label>
      <label>
        범위{" "}
        <select
          value={scope}
          onChange={(change) => {
            setScope(change.target.value as "행사장" | "행정동" | "시군구");
            if (state === "saved") setState("idle");
          }}
        >
          <option>행사장</option>
          <option>행정동</option>
          <option>시군구</option>
        </select>
      </label>
      <button type="submit" disabled={state === "saving"}>
        {actualSubmitLabel(state === "saving", hasSaved)}
      </button>
      {error && <p role="alert">{error}</p>}
      {state === "saved" && (
        <div role="status">
          <p>실측을 저장했어요.</p>
          {comparison && <ComparisonResult result={comparison} />}
        </div>
      )}
    </form>
  );
}
