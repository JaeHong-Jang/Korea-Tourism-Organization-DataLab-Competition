// 근거 종류 필터의 방향키 이동을 한 곳에서 처리한다.
import type { Evidence } from "@crowdcast/contracts/types";
import type { KeyboardEvent } from "react";
import { mapEvidenceKinds } from "./evidence-map-table";

// 필터의 선택은 버튼에 남기고 방향키는 초점만 옮긴다.
export function focusEvidenceKind(
  event: KeyboardEvent<HTMLButtonElement>,
  kind: Evidence["kind"],
  onFocus: (kind: Evidence["kind"]) => void,
) {
  const index = mapEvidenceKinds.indexOf(kind);
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? mapEvidenceKinds.length - 1
        : event.key === "ArrowRight" || event.key === "ArrowDown"
          ? (index + 1) % mapEvidenceKinds.length
          : event.key === "ArrowLeft" || event.key === "ArrowUp"
            ? (index + mapEvidenceKinds.length - 1) % mapEvidenceKinds.length
            : -1;
  if (next < 0) return;
  event.preventDefault();
  onFocus(mapEvidenceKinds[next]);
  event.currentTarget.parentElement
    ?.querySelectorAll<HTMLButtonElement>("button")
    [next]?.focus();
}
