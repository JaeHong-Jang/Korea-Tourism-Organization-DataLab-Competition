// 방문객에게 조건에 맞는 일괄 예보 목록을 한 번 보내고 새 예보는 만들지 않는다

import { createForecastClient } from "../../clients/forecast-client.js";
import { createForecastQueries } from "../../clients/forecast-queries.js";
import type { NearLocation } from "../analysis/draft-answer.js";
import { addDays } from "../analysis/normalize/date.js";
import type { Deadline } from "../lead/deadline.js";
import type { Agent } from "../runtime/agent.js";
import type { EventWriter } from "../runtime/events.js";
import type { Executor } from "../runtime/executor.js";
import type { TeamSettings } from "../runtime/settings.js";
import {
  recommendationConditions,
  selectRecommendations,
} from "./conditions.js";
import { nearbyRecommendations } from "./distance.js";
import {
  chooseOrigin,
  extractRecommendationPlace,
  nearbyWords,
  type SearchOrigin,
} from "./location.js";

// 분류·검색은 숫자나 설명 문장을 생성하지 않는 팀장 작업으로 기록한다
export async function recommendFestivals(
  text: string,
  today: string,
  execute: Executor,
  writer: EventWriter,
  deadline: Deadline,
  settings: TeamSettings,
  near?: NearLocation,
) {
  const search: Agent<string, null> = {
    id: "lead",
    team: "lead",
    usesLlm: false,
    budgetMs: 1_000,
    // 검색 목적만 기록해 사용자 원문을 작업 이력에 남기지 않는다
    async run() {
      return { value: null, note: "요청 분류: recommend (규칙)" };
    },
  };
  await execute(search, "", "방문할 행사를 찾아요.");
  const options = {
    baseUrl: settings.config.services.forecast,
    fetch: settings.fetcher,
    timeoutMs: deadline.budget(8_000),
    signal: deadline.controller.signal,
  };
  const client = createForecastQueries(options);
  const nearby = Boolean(near) || nearbyWords.test(text);
  const place = extractRecommendationPlace(text);
  let origin: SearchOrigin | undefined = near
    ? { lat: near.lat, lng: near.lng, label: "현재 위치" }
    : undefined;
  // 브라우저 좌표가 있으면 지명 해석을 생략하고 해당 요청에서만 기준점으로 쓴다
  if (nearby && !origin) {
    const candidates = place
      ? (await createForecastClient(options).geocode(place)).candidates
      : [];
    const resolved = chooseOrigin(candidates);
    origin = resolved.origin;
    if (!origin) {
      await writer.emit("recommend", {
        query: recommendationConditions(text, today, [], true).query,
        items: [],
        total: 0,
        note: "출발 위치를 확인해 주세요. 시도와 시군구를 함께 알려 주시거나 현재 위치를 사용해 주세요. 참고용 — 담당자 검토 필수 · 추정 산식 기반",
      });
      // recommend 계약은 ask를 허용하지 않으므로 검색 조건을 보존한 문장 버튼으로 되묻는다
      await writer.emit("suggest", {
        actions: resolved.choices.slice(0, 10).map((candidate) => ({
          id: `near-${candidate.sigunguCode}`,
          label: place
            ? text.replace(place, candidate.sigunguName)
            : `${candidate.sigunguName} 근처 축제 추천`,
        })),
      });
      return;
    }
  }
  const requested = recommendationConditions(text, today, [], nearby).query;
  const festivals = nearby
    ? await client.festivals(requested.from, requested.to)
    : await client.festivals();
  let conditions = recommendationConditions(text, today, festivals, nearby);
  let items = selectRecommendations(festivals, conditions);
  let widened = false;
  let radius = 60;
  if (origin) ({ items, radius } = nearbyRecommendations(items, origin));
  // 빈 결과에서만 기간을 한 번 넓히고 유형·지역 조건과 원본 요약은 유지한다
  if (!items.length && !nearby) {
    widened = true;
    conditions.query.to = [
      conditions.query.to,
      addDays(conditions.query.from, 60),
    ]
      .sort()
      .at(-1) as string;
    const expanded = await client.festivals(
      conditions.query.from,
      conditions.query.to,
    );
    const range = { from: conditions.query.from, to: conditions.query.to };
    conditions = recommendationConditions(text, today, [
      ...festivals,
      ...expanded,
    ]);
    Object.assign(conditions.query, range);
    items = selectRecommendations(expanded, conditions);
  }
  const notice = "참고용 — 담당자 검토 필수 · 순간 최대 인원은 추정 산식 기반";
  await writer.emit("recommend", {
    query: conditions.query,
    items: items.slice(0, 10),
    total: items.length,
    note: [
      origin
        ? `반경 ${radius} km에서 가까운 순으로 찾았어요.${radius === 120 ? " 반경을 넓혀 다시 찾았어요." : ""} 거리는 좌표 간 직선거리 추정이며 이동 거리가 아니에요.`
        : "",
      widened ? "기간을 넓혀 다시 찾았어요." : "",
      !items.length
        ? "조건에 맞는 행사가 없어요. 다른 지역이나 유형으로 찾아보세요."
        : "",
      notice,
    ]
      .filter(Boolean)
      .join(" "),
  });
}
