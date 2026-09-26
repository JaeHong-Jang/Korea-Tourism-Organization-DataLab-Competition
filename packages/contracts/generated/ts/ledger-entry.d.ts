/* 자동 생성 — packages/contracts/schemas에서 npm run contracts:gen 으로 만든다. 직접 고치지 않는다 */

/**
 * 해시 체인: hash = sha256(prevHash + payloadHash)
 */
export interface LedgerEntry {
  seq: number;
  forecastId: string;
  eventId: string;
  registeredAt: string;
  leadDays: number;
  forecast: {
    dailyMeanP10: number;
    dailyMeanP50: number;
    dailyMeanP90: number;
    /**
     * 1 소규모 · 2 수립 권고 · 3 수립 대상 · 4 대규모
     */
    level: number;
  };
  payloadHash: string;
  prevHash: string;
  hash: string;
}
