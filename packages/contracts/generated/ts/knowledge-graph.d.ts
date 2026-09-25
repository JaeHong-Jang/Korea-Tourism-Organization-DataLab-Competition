/* 자동 생성 — packages/contracts/schemas에서 npm run contracts:gen 으로 만든다. 직접 고치지 않는다 */

/**
 * 온톨로지 시각화용: TBox 클래스·관계 + 기준 그래프(규칙·조항·데이터셋·가정·모델 실행·파이프라인 단계·파일·에이전트). 세션 그래프는 넣지 않는다
 */
export interface KnowledgeGraph {
  masterVersion: number;
  generatedAt: string;
  nodes: {
    id: string;
    kind: "class" | "rule" | "clause" | "dataset" | "assumption" | "model" | "stage" | "file" | "agent" | "other";
    label: string;
    note?: string | null;
    url?: string | null;
  }[];
  edges: {
    source: string;
    target: string;
    /**
     * CURIE(예: cc:basedOn, prov:used)
     */
    predicate: string;
    label: string;
  }[];
}
