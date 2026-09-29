// 가까운 행사도 실제 좌표를 이동시키지 않아 건물 확대 위치가 어긋나지 않게 한다.
import { expect, test } from "vitest";
import { sceneFestivals } from "../__fixtures__/festivals";
import { placeFestivals } from "../festival-models/placement";
import { projectKorea } from "../projection";

test("같은 좌표의 여러 행사도 실제 지도 위치를 유지한다", () => {
  const first = sceneFestivals[0];
  const events = [first, { ...first, eventId: `${first.eventId}-second` }];
  const expected = projectKorea(first.lng, first.lat);
  for (const placed of placeFestivals(events))
    expect([placed.x, placed.z]).toEqual(expected);
});
