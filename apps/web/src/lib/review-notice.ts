// 발행 문장 끝에 붙은 검토·표본 안내 꼬리말을 화면에서만 뗀다(발행 기록은 그대로 둔다).

const NOTICES = [
  /\s*참고용\s*[—-]\s*담당자 검토 필수\.?/g,
  /\s*·?\s*표본 한계로 구간 기준 표시\.?/g,
];

// 꼬리말을 지운 뒤 남는 앞뒤 공백과 문장 끝 "·"를 정리한다.
export function stripReviewNotice(text: string): string {
  return NOTICES.reduce((result, pattern) => result.replace(pattern, ""), text)
    .replace(/\s*·\s*$/, "")
    .trim();
}
