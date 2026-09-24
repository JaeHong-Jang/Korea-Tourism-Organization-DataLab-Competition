// 계약 판정 등급을 색 점과 아이콘과 글자로 함께 보여 준다.
import type { ForecastCard, Judgment } from "@crowdcast/contracts/types";
import { AlertTriangle, CircleCheck, ShieldAlert, Siren } from "lucide-react";
import { formatPercent } from "../../lib/format";
import { ComponentState, type ComponentStatus } from "./component-state";

type Level = Pick<Judgment, "level" | "label"> | ForecastCard["judgment"];
const icons = [CircleCheck, AlertTriangle, ShieldAlert, Siren];

// 등급 색은 점과 아이콘에만 사용하고 참고용 예보를 점선으로 구분한다.
export function LevelBadge({
  judgment,
  probability,
  provisional = false,
  status = "ready",
}: {
  judgment?: Level | null;
  probability?: number;
  provisional?: boolean;
  status?: ComponentStatus;
}) {
  if (status !== "ready" || !judgment)
    return (
      <ComponentState
        name="판정 등급"
        status={status === "ready" ? "empty" : status}
      />
    );
  const Icon = icons[judgment.level - 1];
  if (!Icon) return <ComponentState name="판정 등급" status="error" />;
  return (
    <span
      className={`level-badge level-badge--${judgment.level}${provisional ? " level-badge--provisional" : ""}`}
    >
      <span className="level-badge__dot" aria-hidden="true" />
      <Icon size={16} aria-hidden="true" />
      <span>{judgment.label}</span>
      {provisional && <small>참고용</small>}
      {probability !== undefined && <small>{formatPercent(probability)}</small>}
    </span>
  );
}
