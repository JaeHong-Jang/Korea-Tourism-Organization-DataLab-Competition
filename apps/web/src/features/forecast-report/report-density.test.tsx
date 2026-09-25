// 면적당 인원 계산과 권고 초과 안내를 확인한다.
import { describe, expect, it } from "vitest";
import { density, PER_SQUARE_METER } from "./report-density";

describe("면적당 인원", () => {
  it("넣은 면적으로 ㎡당 인원을 계산하고 면적이 없으면 계산하지 않는다", () => {
    expect(PER_SQUARE_METER).toBe(4);
    expect(density(181520, 45380)).toBe(4);
    expect(density(20000, 4000)).toBe(5);
    expect(density(20000, 0)).toBeNull();
    expect(density(20000, Number.NaN)).toBeNull();
    expect(density(null, 1000)).toBeNull();
  });
});
