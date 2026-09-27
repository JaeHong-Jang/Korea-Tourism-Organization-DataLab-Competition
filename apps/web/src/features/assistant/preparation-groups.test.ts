// 준비 권고 분류가 원문을 누락하거나 문서 링크를 체크 항목으로 바꾸지 않는지 확인한다.
import { expect, it } from "vitest";
import { preparationGroups } from "./preparation-groups";

it("원문을 보존하고 중복과 문서 링크만 제외한다", () => {
  const actions = [
    { id: "staff", label: "안전요원 배치 및 역할 확인" },
    { id: "rain", label: "우천 시 대피 공간" },
    { id: "other", label: "행사 특수 장비 점검" },
    { id: "duplicate", label: "우천 시 대피 공간" },
    { id: "report", label: "예보서 보기", href: "/f/current" },
  ];
  const groups = preparationGroups(actions);
  expect(groups.map((group) => group.title)).toEqual([
    "안전요원 배치",
    "우천·대피 준비",
    "기타 준비 사항",
  ]);
  expect(groups.flatMap((group) => group.items)).toEqual(actions.slice(0, 3));
});
