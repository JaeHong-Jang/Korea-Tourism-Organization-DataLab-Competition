// 이번 요청에서 실제 전송한 결과만 숫자 없는 팀장 답변 사실로 축약한다
import type { EventData, EventWriter } from "../runtime/events.js";

export type ReplyFacts = {
  names: string[];
  grades: string[];
  conditions: string[];
  template: string;
  phrases: string[];
};
const gradeNames = ["소규모", "수립 권고", "수립 대상", "대규모"];

// 이름에 숫자나 제어 문자가 있으면 임의로 이름을 바꾸지 않고 요약에서 제외한다
function safeName(name: string) {
  return name.length <= 100 && /^[가-힣A-Za-z ·-]+$/.test(name);
}

// 원본 요청·좌표·예측 수치·근거 문장은 보관하거나 LLM에 전달하지 않는다
export function collectReplyFacts(output: EventWriter) {
  const facts: ReplyFacts = {
    names: [],
    grades: [],
    conditions: [],
    template: "요청을 확인했어요. 이어서 필요한 내용을 알려 주세요.",
    phrases: [],
  };
  let eventName: string | null = null;
  let grade: string | undefined;
  const writer: EventWriter = {
    // 계약을 통과해 전송한 이벤트만 최종 안내의 사실로 인정한다
    async emit(event, data) {
      await output.emit(event, data);
      if (event === "event_card")
        eventName = (data as EventData["event_card"]).name;
      if (event === "forecast")
        grade = gradeNames[(data as EventData["forecast"]).judgment.level - 1];
      if (event === "recommend") {
        const result = data as EventData["recommend"];
        facts.names = result.items
          .map(({ summary }) => summary.name)
          .filter(safeName);
        facts.grades = [
          ...new Set(
            result.items
              .map(({ summary }) => gradeNames[summary.level - 1])
              .filter((name) => name !== undefined),
          ),
        ];
        // 서로 다른 행사 등급을 뒤바꿔 말하지 않도록 공통 등급만 대화에 제공한다
        if (facts.grades.length > 1) facts.grades = [];
        const nearby = result.items.some(({ reason }) =>
          reason.includes("가까운 거리순"),
        );
        facts.conditions = [
          ...(result.query.type ? [result.query.type] : []),
          ...(nearby ? ["가까운 순"] : []),
        ];
        facts.template = result.note.startsWith("출발 위치")
          ? "어디서 출발하시는지 확인하고 싶어요. 시도와 시군구를 함께 알려 주세요."
          : result.items.length
            ? nearby
              ? "가까운 순으로 축제를 골라 봤어요. 마음에 드는 행사를 골라 주세요."
              : "말씀하신 조건에 맞는 행사를 찾아봤어요. 마음에 드는 행사를 골라 주세요."
            : "조건에 맞는 행사를 찾지 못했어요. 다른 지역이나 유형으로 다시 찾아볼까요?";
        if (result.items.length)
          facts.phrases = [
            "목록을 함께 살펴볼까요",
            "행사를 찾았어요",
            "축제를 골랐어요",
            "추천 목록을 확인해 주세요",
          ];
      }
      if (event === "ask") {
        facts.template = "이어서 도와드릴게요. 안내된 질문에 답해 주세요.";
      }
      if (
        event === "suggest" &&
        (data as EventData["suggest"]).actions.some(
          (action) => action.id === "plan-docx",
        )
      ) {
        facts.template =
          "계획 초안을 준비했어요. 담당자 검토 후 사용해 주세요.";
      }
      if (
        event === "gate" &&
        (data as EventData["gate"]).gate === "publish" &&
        (data as EventData["gate"]).passed
      ) {
        facts.names = eventName && safeName(eventName) ? [eventName] : [];
        facts.grades = grade ? [grade] : [];
        facts.template = "예보서를 준비했어요. 결과와 근거를 함께 살펴보세요.";
        facts.phrases = ["예보서가 준비됐어요", "예보서를 확인해 주세요"];
      }
      if (event === "agent_step") {
        const step = data as EventData["agent_step"];
        if (step.note === "예보서를 저장했어요")
          facts.template = "예보서를 저장했어요. 필요할 때 다시 확인해 주세요.";
        if (step.note.startsWith("저장하지 못했어요"))
          facts.template = "저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.";
      }
      if (event === "error") {
        const error = data as EventData["error"];
        facts.names = [];
        facts.grades = [];
        facts.conditions = [];
        facts.phrases = [];
        facts.template =
          error.code === "OUT_OF_SCOPE"
            ? "안내된 내용을 확인해 주세요. 행사 찾기와 예보 상담을 도와드릴게요."
            : "요청을 끝까지 처리하지 못했어요. 안내를 확인하고 다시 시도해 주세요.";
      }
    },
  };
  return { facts, writer };
}
