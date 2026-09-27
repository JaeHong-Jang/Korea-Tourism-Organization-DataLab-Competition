// 모델 카드의 공개 정보와 한계 안내를 독립적으로 검증한다.
import type { ModelCard } from "@crowdcast/contracts/types";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ModelDetails } from "../model-details";
import { backtest } from "./validation-fixtures";

const ready = <T,>(value: T) => ({ status: "ready" as const, value });
const html = (node: React.ReactNode) => renderToStaticMarkup(node);

// 모델 notes의 공백과 문단 구분은 원문을 고치지 않는다.
it("모델 카드의 한계 원문을 보존한다", () => {
  const notes = "첫 문단입니다.\n\n둘째 문단입니다.";
  const card = {
    id: "mr-v1-f0667d86aafd47d09472",
    target: "일평균 방문객",
    createdAt: "2026-09-25T12:00:00+09:00",
    modelVersion: "v1-cf776619db785ed12810",
    trainRange: { from: "2022", to: "2024" },
    evalYears: [2025],
    backtestRunId: backtest.runId,
    features: ["행사 유형"],
    notes,
  } as ModelCard;
  const output = html(<ModelDetails state={ready(card)} goldenEmpty />);
  expect(output).toContain("원문 보기");
  expect(output).toContain(notes);
  expect(output).not.toContain("카드에 기록 없음");
  expect(output).toContain("골든 사례 0건 — 사례 재현 검증 전 임시 사용");
});

// 모델 카드 notes의 수치와 한계 문장만 요약에 들어간다.
it("모델 카드 공개 필드의 분모·포함률·제외 사유를 요약한다", () => {
  const card = {
    id: "mr-v1-064e60073a7411037212",
    target: "일평균 방문객",
    createdAt: "2026-09-25T12:00:00+09:00",
    modelVersion: "v1-064e60073a7411037212",
    trainRange: { from: "2022", to: "2024" },
    evalYears: [2025],
    backtestRunId: backtest.runId,
    features: ["행사 유형"],
    notes:
      '공개 분모(주 모델): 평가 86건(골드 1·실버 85), 80% 구간 포함 49/86; 코로나(2020·2021) 제외=True. 순간 최대 및 실측 환산 판정은 추정 산식 기반이며 실제 순간 인원 정답이 아니다. 작은 행사는 크게 예보될 수 있다. labels SHA-256=abc; 피처별 결측 수={"fee": 0}.',
  } as ModelCard;
  const output = html(<ModelDetails state={ready(card)} goldenEmpty />);
  expect(output).toContain("평가 86건 · 골드 1건 · 실버 85건");
  expect(output).toContain("80% 구간 포함률 57.0% (49/86)");
  expect(output).toContain("코로나 연도(2020·2021)는 제외했어요");
  expect(output).toContain(
    "순간 최대는 추정 산식 기반이며 실측 정답이 아니에요",
  );
  expect(output).toContain("작은 행사는 크게 예보될 수 있어요");
  expect(output.indexOf("원문 보기")).toBeLessThan(
    output.indexOf("labels SHA-256"),
  );
});
