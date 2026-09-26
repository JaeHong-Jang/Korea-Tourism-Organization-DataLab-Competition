/* 자동 생성 — packages/contracts/schemas에서 npm run contracts:gen 으로 만든다. 직접 고치지 않는다 */

/**
 * M7-F2 활용 명세표·서식4. 파이프라인이 실제로 읽은 데이터만 행이 된다(확인일 필수)
 */
export interface DatalabSpec {
  generatedAt: string;
  rows: {
    datasetId: string;
    title: string;
    /**
     * 데이터랩 메뉴 경로. data.go.kr API만 쓴 경우 null
     */
    datalabMenu: string | null;
    /**
     * 지표(예: 외지인 방문자 수)
     */
    metric: string;
    period: Period;
    /**
     * 인원(명·명/일)·비율(%·비율·배)·금액(원)·기간(일 — 예: 반영한 임시공휴일 일수)
     */
    unit: "명" | "명/일" | "%" | "원" | "배" | "비율" | "일";
    /**
     * 용도(예: 평시 기준선·피처)
     */
    purpose: string;
    /**
     * 쓰는 기능 id(docs/plan/11)
     *
     * @minItems 1
     */
    usedIn: [string, ...string[]];
    rowsRead: number;
    confirmedAt: string;
    /**
     * 근거 그래프에서 이 데이터셋을 인용한 근거 수(datalab-usage와 같은 값)
     */
    evidenceCount: number | null;
  }[];
}
export interface Period {
  from: string;
  to: string;
}
