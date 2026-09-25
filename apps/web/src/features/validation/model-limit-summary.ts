// 모델 카드 notes의 공개 기록만 읽어 한계 요약 문장으로 바꾼다.
import type { ModelCard } from "@crowdcast/contracts/types";

// 빠진 기록은 수치를 채워 넣지 않고 그대로 미기록 상태로 보인다.
export function modelLimitSummary(
  card: ModelCard,
  goldenEmpty: boolean,
): string[] {
  const notes = card.notes;
  const sample = notes.match(/평가\s+(\d+)건\(골드\s+(\d+)·실버\s+(\d+)\)/);
  const coverage = notes.match(/80% 구간 포함\s+(\d+)\/(\d+)/);
  const validCoverage = coverage && Number(coverage[2]) > 0 ? coverage : null;
  const covid = notes.match(/코로나\(2020·2021\) 제외=(True|False)/);
  const peak = notes.includes("실제 순간 인원 정답이 아니다");
  const smallOver = /작은 행사.{0,30}(과대|크게 예보)/.test(notes);
  const smallBias = notes.includes("작은 행사 규모 편향");
  const number = (value: string) => Number(value).toLocaleString("ko-KR");

  // 공개 분모와 포함률은 notes에 적힌 분자·분모를 그대로 사용한다.
  return [
    sample
      ? `평가 ${number(sample[1])}건 · 골드 ${number(sample[2])}건 · 실버 ${number(sample[3])}건`
      : "평가 표본·골드/실버 구성: 카드에 기록 없음",
    validCoverage
      ? `80% 구간 포함률 ${((Number(validCoverage[1]) / Number(validCoverage[2])) * 100).toFixed(1)}% (${number(validCoverage[1])}/${number(validCoverage[2])})`
      : "80% 구간 포함률: 카드에 기록 없음",
    covid
      ? covid[1] === "True"
        ? "코로나 연도(2020·2021)는 제외했어요"
        : "코로나 연도(2020·2021)는 제외하지 않았어요"
      : "코로나 연도 제외 여부: 카드에 기록 없음",
    peak
      ? "순간 최대는 추정 산식 기반이며 실측 정답이 아니에요"
      : "순간 최대 추정 여부: 카드에 기록 없음",
    smallOver
      ? "작은 행사는 크게 예보될 수 있어요"
      : smallBias
        ? "작은 행사에는 규모 편향이 남을 수 있어요"
        : "작은 행사 예보 편향: 카드에 기록 없음",
    goldenEmpty
      ? "골든 사례 0건 — 사례 재현 검증 전 임시 사용"
      : "골든 사례 수: 검증 화면에서 확인하세요",
  ].filter((line) => !line.endsWith("카드에 기록 없음")); // 카드에 없는 항목은 줄을 빼고 원문 보기에 맡긴다
}
