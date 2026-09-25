// 계약 견본과 실패 응답으로 운영 표·카드의 독립 상태를 검증한다.
// @vitest-environment jsdom
import type { OpsStatus, PipelineRun } from "@crowdcast/contracts/types";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import statusFixture from "../../../../../packages/contracts/fixtures/ops-status/valid-example.json";
import runFixture from "../../../../../packages/contracts/fixtures/pipeline-run/valid-running.json";
import {
  getOpsEvaluation,
  getOpsFreshness,
  getOpsRuns,
  getOpsStatus,
} from "../../lib/ops-api";
import { EvaluationCard } from "./evaluation-card";
import { FreshnessCard } from "./freshness-card";
import { RunList } from "./run-list";

const run = runFixture as unknown as PipelineRun;
const status = statusFixture as unknown as OpsStatus;
afterEach(() => vi.unstubAllGlobals());

// 배열 각 항목과 상태 객체는 계약과 맞을 때만 화면에 들어간다.
it("운영 API의 실행·상태 계약을 검증한다", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify([run]), { status: 200 })),
  );
  await expect(getOpsRuns()).resolves.toHaveLength(1);
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify([{ ...run, status: "unknown" }]), {
          status: 200,
        }),
    ),
  );
  await expect(getOpsRuns()).rejects.toThrow("API 계약 불일치");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(status), { status: 200 })),
  );
  await expect(getOpsStatus()).resolves.toMatchObject(status);
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ ...status, graph: null }), {
          status: 200,
        }),
    ),
  );
  await expect(getOpsStatus()).rejects.toThrow("API 계약 불일치");
  await expect(getOpsEvaluation()).resolves.toHaveProperty("evals");
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            ...status,
            graph: status.graph,
            evals: { ...status.evals, cases: "24" },
          }),
          { status: 200 },
        ),
    ),
  );
  await expect(getOpsEvaluation()).rejects.toThrow("API 계약 불일치");
  await expect(getOpsFreshness()).resolves.toHaveProperty("model");
});

// 실패 단계와 해시·게이트를 텍스트로 드러내고 빈 실행에는 명령을 보여 준다.
it("실행 단계를 펼칠 수 있고 실패를 강조한다", () => {
  const failed: PipelineRun = {
    ...run,
    status: "failed",
    summary: "수집 게이트 실패",
    stages: [
      {
        ...run.stages[0],
        status: "failed",
        gate: { passed: false, message: "결측률 초과" },
      },
    ],
  };
  const markup = renderToStaticMarkup(
    <RunList state={{ phase: "ready", value: [failed] }} />,
  );
  expect(markup).toContain("ops-stage--failed");
  expect(markup).toContain("게이트: 실패 · 결측률 초과");
  expect(markup).toContain("000000000000");
  expect(markup).toContain("단계 펼치기");
  expect(
    renderToStaticMarkup(<RunList state={{ phase: "ready", value: [] }} />),
  ).toContain("새로고침");
});

// 평가가 비었거나 실행 요청만 오류여도 최신성 카드 값은 남는다.
it("평가·최신성 카드에 각 상태와 지연 경고를 표시한다", () => {
  expect(
    renderToStaticMarkup(
      <EvaluationCard state={{ phase: "ready", value: status }} />,
    ),
  ).toContain("근거 없는 발행");
  expect(
    renderToStaticMarkup(
      <EvaluationCard
        state={{ phase: "ready", value: { ...status, evals: null } }}
      />,
    ),
  ).toContain("평가 결과가 없어요");
  const late = {
    ...status,
    freshness: [{ ...status.freshness[0], lastObservedDate: "2026-07-01" }],
  };
  expect(
    renderToStaticMarkup(
      <FreshnessCard state={{ phase: "ready", value: late }} />,
    ),
  ).toContain("35일 초과 경고");
  expect(
    renderToStaticMarkup(
      <RunList state={{ phase: "error", message: "API 요청 실패: 503" }} />,
    ),
  ).toContain("실행 기록을 확인할 수 없어요");
});

// 선택 집계가 들어오면 정해진 순서의 표와 가짜 실행·모델 미검증 고지를 보여 준다.
it("항목별 평가·지연과 모델 판정을 계약 값 그대로 표시한다", async () => {
  if (!status.evals) throw new Error("평가 픽스처가 없습니다");
  const detailed: OpsStatus = {
    ...status,
    model: { ...status.model, verdict: "미검증" },
    evals: {
      ...status.evals,
      checks: {
        sequence: { passed: 20, total: 20 },
        evidence: { passed: 19, total: 20 },
        numbers: { passed: 18, total: 20 },
        interval: { passed: 17, total: 20 },
        ask: { passed: 16, total: 20 },
        intent: { passed: 15, total: 20 },
        publication: { passed: 14, total: 20 },
        execution: { passed: 13, total: 20 },
      },
      latencySeconds: {
        forecast: { n: 9, p50: 5.32, p95: 7.61 },
        publishedDone: { n: 10, p50: 11.45, p95: 14.64 },
      },
      mode: "fake",
    },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(detailed)),
  );
  await expect(getOpsStatus()).resolves.toMatchObject(detailed);
  const evaluation = renderToStaticMarkup(
    <EvaluationCard state={{ phase: "ready", value: detailed }} />,
  );
  expect(evaluation).toContain("가짜 서비스 실행");
  expect(evaluation).toContain("서식4에 사용하지 마세요");
  expect(evaluation).toContain("18 / 20");
  expect(evaluation).toContain("p50 5.3초 · p95 7.6초");
  expect(evaluation).toContain("p50 11.4초 · p95 14.6초");
  expect(evaluation.indexOf("순서 규칙")).toBeLessThan(
    evaluation.indexOf("근거 연결"),
  );
  expect(evaluation.indexOf("근거 연결")).toBeLessThan(
    evaluation.indexOf("숫자 일치"),
  );
  const freshness = renderToStaticMarkup(
    <FreshnessCard state={{ phase: "ready", value: detailed }} />,
  );
  expect(freshness).toContain("미검증");
  expect(freshness).toContain("골든 사례 0건 — 사례 재현 검증 전 임시 사용");
});
