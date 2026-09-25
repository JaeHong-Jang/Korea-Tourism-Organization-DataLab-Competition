// 가짜 지오코딩으로 출발점 우선순위·대원거리·반경·지역 선택을 검증한다
// @ts-expect-error 정본 순서 판정기는 JavaScript로 제공된다
import { sequenceProblems } from "@crowdcast/contracts/rules/sse-sequence.mjs";
import type { FestivalSummary } from "@crowdcast/contracts/types";
import { expect, it } from "vitest";
import { validateMessage } from "../src/team/analysis/draft-answer.js";
import { rulePurpose } from "../src/team/lead/purpose.js";
import type { Recommendation } from "../src/team/recommend/conditions.js";
import {
  distanceKm,
  nearbyRecommendations,
} from "../src/team/recommend/distance.js";
import {
  chooseOrigin,
  extractRecommendationPlace,
} from "../src/team/recommend/location.js";
import { festival } from "./proxy-fixture.js";
import { teamFixture } from "./team-fixture.js";

const origin = { lat: 36.8554, lng: 127.4356, label: "진천군" };
const jincheon = {
  ...origin,
  sigunguCode: "43750",
  sigunguName: "진천군",
  score: 0.95,
};
const cheongju: FestivalSummary = {
  ...festival,
  eventId: "e-cheongju-craft",
  name: "청주공예비엔날레",
  sigunguCode: "43111",
  sigunguName: "청주시 상당구",
  lat: 36.6424,
  lng: 127.489,
  startsAt: "2026-10-04T10:00:00+09:00",
  endsAt: "2026-10-04T20:00:00+09:00",
};
const seoul: FestivalSummary = {
  ...cheongju,
  eventId: "e-seoul-fireworks",
  name: "서울세계불꽃축제",
  sigunguCode: "11560",
  sigunguName: "서울 영등포구",
  lat: 37.528,
  lng: 126.934,
  startsAt: "2026-10-03T18:00:00+09:00",
};

// 조사·시군구 약칭·복합 지명·역 이름을 과도한 문맥 없이 추출한다
it.each([
  ["그냥 축제 진천에서 가까운 곳 가고 싶은데", "진천"],
  ["진천군 근처 축제", "진천군"],
  ["부산 해운대 주변 축제", "부산 해운대"],
  ["이번 주말 강남역 근처", "강남역"],
  ["진천 가까운 축제", "진천"],
  ["가까운 축제 진천에서 찾아줘", "진천"],
  ["여기서 가까운 축제", null],
  ["가까운 축제 추천", null],
])("지명: %s", (text, place) =>
  expect(extractRecommendationPlace(text)).toBe(place),
);

// 주최 의사는 가까운 위치 키워드와 브라우저 위치보다 우선한다
it.each(["진천 가까운 축제", "부산 해운대 주변", "강남역 근처", "여기서 축제"])(
  "방문객 분류: %s",
  (text) => {
    expect(rulePurpose(text)).toBe("recommend");
    expect(rulePurpose(`${text} 열어요`)).toBe("new");
  },
);

// 알려진 위도차와 실제 국내 지점의 고정 수치로 반지름·라디안·반올림을 검증한다
it("대원거리 공식을 고정하고 거리순을 날짜순보다 우선한다", () => {
  expect(distanceKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(
    111.19492664455873,
    8,
  );
  expect(distanceKm(origin, origin)).toBe(0);
  expect(distanceKm(origin, cheongju)).toBeCloseTo(24.15766279145967, 5);
  const result = nearbyRecommendations(
    [seoul, cheongju].map((summary) => ({ summary, reason: "조회 기간 일치" })),
    origin,
  );
  expect(result.radius).toBe(60);
  expect(result.items.map((item) => item.summary)).toEqual([cheongju]);
  expect(result.items[0].summary).toBe(cheongju);
  expect(result.items[0].reason).toContain("진천군에서 약 24 km");
});

// 경계는 표시용 반올림과 독립적이고 먼 행사만 있으면 확장해도 빈 목록이다
it("반경을 한 번 넓히고 표시 반올림 전 거리로 경계를 판정한다", () => {
  const row = (km: number) => ({
    summary: { ...cheongju, lat: ((km / 6371) * 180) / Math.PI, lng: 0 },
    reason: "",
  });
  expect(
    nearbyRecommendations([row(60.01)], { lat: 0, lng: 0, label: "출발지" })
      .radius,
  ).toBe(120);
  expect(
    nearbyRecommendations([row(120.01)], { lat: 0, lng: 0, label: "출발지" })
      .items,
  ).toEqual([]);
  expect(
    nearbyRecommendations([{ summary: seoul, reason: "" }], origin).items,
  ).toHaveLength(1);
});

// 순서가 뒤섞인 복수 후보는 유의한 점수 차이만 자동 선택하고 동점은 되묻는다
it("지오코딩 후보 점수와 모호성을 구분한다", () => {
  const busan = {
    ...jincheon,
    sigunguCode: "26350",
    sigunguName: "부산 해운대구",
    score: 0.7,
  };
  expect(chooseOrigin([busan, jincheon]).origin?.label).toBe("진천군");
  expect(
    chooseOrigin([busan, { ...jincheon, score: 0.7 }]).origin,
  ).toBeUndefined();
  expect(chooseOrigin([{ ...jincheon, lat: 100 }]).choices).toEqual([]);
});

// HTTP부터 SSE까지 실제 연결해 지역 밖 행사도 거리로 고르고 요약 수치는 그대로 둔다
it.each([false, true])(
  "진천 지오코딩 추천과 반경 확대=%s",
  async (expanded) => {
    const harness = teamFixture({
      override: async ({ url, body }) => {
        if (url.pathname === "/v1/geocode") {
          expect(body).toMatchObject({ venueText: "진천" });
          return Response.json({ candidates: [jincheon] });
        }
        if (url.pathname === "/v1/festivals/upcoming")
          return Response.json(expanded ? [seoul] : [seoul, cheongju]);
      },
    });
    const events = await harness.message(await harness.create(), {
      text: "그냥 축제 진천에서 가까운 곳 가고 싶은데",
    });
    expect(sequenceProblems(events, { mode: "recommend" })).toEqual([]);
    const data = events.find((event) => event.event === "recommend")
      ?.data as Recommendation;
    expect(data.query.sido).toBeNull();
    expect(data.items[0].summary).toEqual(expanded ? seoul : cheongju);
    expect(data.items[0].reason).toMatch(/진천군에서 약 \d+ km/);
    expect(data.note).toContain(expanded ? "120 km" : "60 km");
    expect(
      harness.calls.filter(
        (call) => call.url.pathname === "/v1/festivals/upcoming",
      ),
    ).toHaveLength(1);
  },
);

// near는 지명과 충돌해도 우선하며 trace와 다음 요청에는 위치를 남기지 않는다
it("near 우선·미저장·다음 요청 지역 필터", async () => {
  const near = {
    lat: 37.527123456,
    lng: 126.933456789,
    label: "사용자 위치 표식",
  };
  const harness = teamFixture({
    override: async ({ url }) =>
      url.pathname === "/v1/festivals/upcoming"
        ? Response.json([seoul, cheongju])
        : undefined,
  });
  const id = await harness.create();
  const events = await harness.message(id, {
    text: "진천에서 가까운 축제",
    near,
  });
  const data = events.find((event) => event.event === "recommend")
    ?.data as Recommendation;
  expect(data.items[0].summary).toEqual(seoul);
  expect(data.items[0].reason).toContain("현재 위치에서 약 0 km");
  expect(
    harness.calls.some((call) => call.url.pathname === "/v1/geocode"),
  ).toBe(false);
  const trace = JSON.stringify(harness.trace(id));
  for (const value of Object.values(near))
    expect(trace).not.toContain(String(value));
  const next = await harness.message(id, { text: "청주시 축제 추천" });
  expect(
    (
      next.find((event) => event.event === "recommend")?.data as
        | Recommendation
        | undefined
    )?.items.map((item) => item.summary),
  ).toEqual([cheongju]);
});

// ambiguous 검색은 ask 없이 원래 유형·기간을 담은 선택 문장으로 재개한다
it("동명 지역은 추천 버튼으로 되묻고 조건을 보존한다", async () => {
  const harness = teamFixture({
    override: async ({ url }) =>
      url.pathname === "/v1/geocode"
        ? Response.json({
            candidates: [
              jincheon,
              {
                ...jincheon,
                sigunguCode: "26350",
                sigunguName: "부산 해운대구",
              },
            ],
          })
        : undefined,
  });
  const events = await harness.message(await harness.create(), {
    text: "다음 주말 진천 근처 불꽃 축제",
  });
  expect(sequenceProblems(events, { mode: "recommend" })).toEqual([]);
  expect(events.some((event) => event.event === "ask")).toBe(false);
  expect(events.find((event) => event.event === "suggest")?.data).toMatchObject(
    {
      actions: [
        { label: "다음 주말 진천군 근처 불꽃 축제" },
        { label: "다음 주말 부산 해운대구 근처 불꽃 축제" },
      ],
    },
  );
});

// 잘못된 브라우저 좌표를 SSE 시작 전에 거부한다
it.each([
  { lat: 91, lng: 127 },
  { lat: 36, lng: 181 },
  { lat: "36", lng: 127 },
  { lat: 36 },
])("잘못된 near: %j", (near) => {
  expect(validateMessage({ text: "축제", near })).toBe(false);
});

// 거리와 날짜가 상충해도 거리가 우선이고 같은 거리에서는 식별자로 결정한다
it("여러 근거리 행사도 거리순이며 동점 순서가 결정적이다", () => {
  const nearer = {
    ...cheongju,
    eventId: "e-jincheon-nongdari",
    name: "진천농다리축제",
    lat: origin.lat,
    lng: origin.lng,
    startsAt: "2026-10-20T10:00:00+09:00",
  };
  const twin = { ...nearer, eventId: "e-jincheon-culture" };
  const result = nearbyRecommendations(
    [cheongju, nearer, twin].map((summary) => ({
      summary,
      reason: "조회 기간 일치",
    })),
    origin,
  );
  expect(result.items.map((item) => item.summary.eventId)).toEqual([
    twin.eventId,
    nearer.eventId,
    cheongju.eventId,
  ]);
  expect(rulePurpose("이번 주말 진천에서 가까운 축제 추천 부탁해요")).toBe(
    "recommend",
  );
});

// 위치가 없거나 후보가 비어도 전국 결과를 가까운 행사로 가장하지 않는다
it.each(["여기서 가까운 축제", "진천 근처 축제"])(
  "기준점 미확정: %s",
  async (text) => {
    const harness = teamFixture({
      override: async ({ url }) =>
        url.pathname === "/v1/geocode"
          ? Response.json({ candidates: [] })
          : undefined,
    });
    const events = await harness.message(await harness.create(), { text });
    expect(sequenceProblems(events, { mode: "recommend" })).toEqual([]);
    expect(
      events.find((event) => event.event === "recommend")?.data,
    ).toMatchObject({
      items: [],
      total: 0,
      note: expect.stringContaining("출발 위치"),
    });
    expect(
      harness.calls.some(
        (call) => call.url.pathname === "/v1/festivals/upcoming",
      ),
    ).toBe(false);
  },
);
