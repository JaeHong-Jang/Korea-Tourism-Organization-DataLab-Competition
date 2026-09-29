// 인사이트 출처를 펼쳐 확인하고 한계를 포함한 보고서 문장을 복사한다.
import type { Insight } from "@crowdcast/contracts/types";
import { useState } from "react";
import { insightSentence } from "./insight-data";

// 출처와 서버 해석을 보존한 복사 결과의 성공·실패를 명시한다.
export function InsightSources({ insight }: { insight: Insight }) {
  const [copyState, setCopyState] = useState<"idle" | "done" | "error">("idle");
  const sentence = insightSentence(insight);

  // 브라우저 권한이 없을 때 직접 선택해 복사할 문장도 제공한다.
  async function copy() {
    setCopyState("idle");
    try {
      await navigator.clipboard.writeText(sentence);
      setCopyState("done");
    } catch {
      setCopyState("error");
    }
  }
  return (
    <footer className="insights-sources">
      <div className="insights-copy-actions">
        <button type="button" onClick={copy}>
          분석 요약 복사
        </button>
        <span role="status">
          {copyState === "done"
            ? "복사됨 · 해석 한계와 출처를 함께 담았어요."
            : ""}
        </span>
      </div>
      {copyState === "error" && (
        <div role="alert">
          <p>
            복사하지 못했어요. 브라우저 권한을 확인하거나 아래 문장을 직접
            복사해 주세요.
          </p>
          <textarea
            aria-label={`${insight.key} 직접 복사할 보고서 문장`}
            readOnly
            value={sentence}
            rows={7}
          />
        </div>
      )}
    </footer>
  );
}
