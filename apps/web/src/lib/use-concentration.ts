// 행사 기간 시군구 관광지 집중률 요약을 불러와 계약을 확인한다(실패는 값을 지어내지 않고 오류 상태로).
import type { Concentration } from "@crowdcast/contracts/types";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { useEffect, useState } from "react";
import schema from "../../../../packages/contracts/schemas/concentration.schema.json";

const ajv = new Ajv2020();
addFormats(ajv);
const valid = ajv.compile<Concentration>(schema);

export type ConcentrationState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; value: Concentration };

// 한국 날짜(YYYY-MM-DD)로 행사 시작·종료일을 자른다.
export function koreaDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

export function useConcentration(
  sigunguCode: string,
  startsAt: string,
  endsAt: string,
) {
  const [state, setState] = useState<ConcentrationState>({ status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    const query = new URLSearchParams({
      sigunguCode,
      from: koreaDate(startsAt),
      to: koreaDate(endsAt),
    });
    fetch(`/api/concentration?${query}`, { signal: controller.signal })
      .then(async (response) => {
        const body: unknown = response.ok ? await response.json() : null;
        if (!controller.signal.aborted)
          setState(
            valid(body)
              ? { status: "ready", value: body }
              : { status: "error" },
          );
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "error" });
      });
    return () => controller.abort();
  }, [sigunguCode, startsAt, endsAt]);
  return state;
}
