// 근거 원문은 보존하면서 관측 항목과 가정 설명을 사용자 언어로 표시한다.
import type { Evidence } from "@crowdcast/contracts/types";
import { featureLabels } from "../../lib/evidence-feature-labels";
import { evidencePayload } from "./forecast-evidence-data";

// 식별 가능한 관측 항목만 이름을 바꾸고 나머지 제목은 발행 문구를 유지한다.
export function evidenceTitle(evidence: Evidence) {
  const feature = evidencePayload(evidence)?.featureName;
  return evidence.kind === "data" &&
    typeof feature === "string" &&
    featureLabels[feature]
    ? `관측 자료 · ${featureLabels[feature]}`
    : evidence.title;
}

// 기술용 열 이름을 치환하되 원래의 범위 밖 판단 내용은 유지한다.
export function readableOodReason(reason: string) {
  return reason
    .replace("학습 범위 밖 피처", "학습 자료의 범위를 벗어난 입력")
    .replace(/\b[a-z_]+\b/g, (key) => featureLabels[key] ?? key);
}

// 내부 문서 경로와 불리언 표기는 접힌 원문에서 확인할 수 있다.
export function readableAssumption(note: string) {
  return note
    .replace(/^docs\/plan\/06 §4 초기 가정;\s*/, "")
    .replaceAll("주말 포함=True", "주말 포함")
    .replaceAll("주말 포함=False", "주말 미포함");
}
