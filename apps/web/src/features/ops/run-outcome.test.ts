// 실행 기록을 사람이 읽는 결과로 가르는 규칙과 백테스트 수치 풀이를 확인한다.
import type { PipelineRun } from "@crowdcast/contracts/types";
import { describe, expect, it } from "vitest";
import { failingChecks, suiteName } from "./evaluation-card";
import { tidyTitle } from "./freshness-card";
import { primaryModel } from "./ops-overview";
import { firstClause, gateMetrics, runOutcome } from "./run-outcome";

type Stage = PipelineRun["stages"][number];
const stage = (
  name: Stage["name"],
  status: Stage["status"],
  message = "",
  ms: number | null = 10,
): Stage => ({
  name,
  status,
  ms,
  gate: {
    passed: status === "passed" ? true : status === "failed" ? false : null,
    message,
  },
  artifacts: [],
});
const run = (
  runId: string,
  status: PipelineRun["status"],
  stages: Stage[],
): PipelineRun => ({
  runId,
  startedAt: "2026-09-26T04:54:14+09:00",
  finishedAt: "2026-09-26T04:54:46+09:00",
  status,
  stages,
  summary: null,
});
const worse =
  "허용 악화폭 초과: MdAPE=49.709348900023315% (직전 49.33759813857037% +3%p); 포함률=47.3% (직전 57.0% -5%p); 종료 코드 0";
const promotedMessage =
  "MdAPE=49.33759813857037% (직전 49.33759813857037% +3%p); 포함률=57.0% (직전 57.0% -5%p); 골든 사례 0건(H8 미확보): 골든 재현 미검증; 종료 코드 0; 사용 모델로 승격(미검증)";

describe("실행 결과 풀이", () => {
  it("백테스트 게이트 문구에서 새 후보와 허용선을 읽는다", () => {
    expect(gateMetrics(worse)).toEqual({
      mdape: 49.7,
      mdapeLimit: 52.3,
      coverage: 47.3,
      coverageLimit: 52,
    });
    expect(gateMetrics("결측률 초과")).toBeNull();
    expect(
      firstClause(
        "시도 1: 결측 194400/1055232=18.422000%; 공유 장부 900/900건",
      ),
    ).toBe("시도 1: 결측 194400/1055232=18.4%");
  });

  it("기준 미달은 오류가 아니라 기존 모델 유지다", () => {
    const outcome = runOutcome(
      run("20260926-a", "failed", [
        stage("train", "passed"),
        stage("backtest", "failed", worse),
      ]),
    );
    expect(outcome.kind).toBe("kept");
    expect(outcome.label).toBe("기존 모델 유지");
    expect(outcome.metrics?.coverage).toBe(47.3);
  });

  it("승격 문구가 있으면 상태가 실패여도 새 모델 적용(미검증)이다", () => {
    const outcome = runOutcome(
      run("20260925-b", "failed", [
        stage("backtest", "skipped", promotedMessage, 21169),
      ]),
    );
    expect(outcome.kind).toBe("promoted");
    expect(outcome.label).toBe("새 모델 적용 · 미검증");
    expect(outcome.sentence).toContain("미검증");
  });

  it("점검 실행·개발 중 기록·오류·통과를 가른다", () => {
    expect(
      runOutcome(
        run("dry-2026", "failed", [
          stage("fetch", "failed", "dry 저장 입력 검사; 끝"),
        ]),
      ).kind,
    ).toBe("dry");
    expect(
      runOutcome(
        run("20260925-c", "failed", [
          stage("labels", "passed"),
          stage(
            "features",
            "skipped",
            "진입점 없음: crowdcast.features.build; skipped",
            0,
          ),
        ]),
      ).kind,
    ).toBe("incomplete");
    const error = runOutcome(
      run("20260925-d", "failed", [stage("fetch", "failed", "결측률 초과")]),
    );
    expect(error.kind).toBe("error");
    expect(error.sentence).toBe("수집에서 멈췄어요 — 결측률 초과");
    expect(
      runOutcome(run("20260925-e", "passed", [stage("fetch", "passed")])).kind,
    ).toBe("passed");
  });
});

describe("운영 화면 도구", () => {
  it("모델 카드 공개 문구에서 주 모델 이름을 읽는다", () => {
    expect(
      primaryModel("G0=simple, 주 모델=simple, judgment.basis=구간").name,
    ).toBe("단순 모델");
    expect(primaryModel("주 모델=lightgbm").name).toBe("LightGBM");
    expect(primaryModel("").name).toBe("확인 불가");
  });

  it("긴 실행 ID를 줄이고 평가 이름·못 미친 항목을 적는다", () => {
    expect(tidyTitle("일괄 예보 · runId batch-3bc93c921343154903abcdef")).toBe(
      "일괄 예보 · batch-3bc93c92…",
    );
    expect(suiteName("scenario")).toBe("평가 시나리오");
    expect(
      failingChecks({
        sequence: { passed: 26, total: 26 },
        publication: { passed: 25, total: 26 },
        execution: { passed: 25, total: 26 },
      } as never),
    ).toEqual(["발행 25/26", "실행 25/26"]);
  });
});
