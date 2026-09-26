// 단일 키워드 의도는 즉시 선택하고 모호한 후속 요청만 한 번 분류한다
import { CLASSIFICATION_PROMPT } from "../../llm/classification-prompt.js";
import type { Intent } from "../../llm/classification-schema.js";
import type { Agent } from "../runtime/agent.js";
import type { Executor } from "../runtime/executor.js";
import {
  type Classification,
  followupSchema,
  validateFollowup,
  whatifMatches,
} from "../whatif/intent.js";
import type { Deadline } from "./deadline.js";

const rules: [Intent, RegExp][] = [
  ["why", /왜|이유|근거/],
  ["save", /저장|보관/],
  ["draft", /초안|계획서|계획/],
  ["whatif", /비\s*(?:가\s*)?오면|요일|바꾸면|바꿔|변경/],
  ["new_event", /(?:새|다른)\s*(?:행사|축제|예보|상담)/],
];

// 여러 키워드가 같은 의도를 가리키면 여전히 단일 규칙으로 취급한다
export function ruleIntents(text: string): Intent[] {
  const kinds = whatifMatches(text);
  const matches = rules
    .filter(([, pattern]) => pattern.test(text))
    .map(([intent]) => intent);
  if (kinds.length) matches.push("whatif");
  return [...new Set(matches)].filter(
    (intent) => intent !== "new_event" || !kinds.includes("similar"),
  );
}

// 원문 대신 의도와 분류 방식만 팀장 기록에 남긴다
function result(value: Classification, method: "규칙" | "LLM") {
  return { value, note: `요청 분류: ${value.intent} (${method})` };
}

const classifier: Agent<string, Classification> = {
  id: "lead",
  team: "lead",
  usesLlm: true,
  budgetMs: 3_000,
  // 규칙이 없거나 충돌할 때만 enum 스키마를 강제해 Ollama를 호출한다
  async run(ctx) {
    const matches = ruleIntents(ctx.input);
    if (matches.length === 1) {
      const kinds = whatifMatches(ctx.input);
      return result(
        {
          intent: matches[0],
          ...(kinds.length === 1 ? { whatifKind: kinds[0] } : {}),
        },
        "규칙",
      );
    }
    try {
      const completion = await ctx.llm.complete({
        schema: followupSchema,
        messages: [
          {
            role: "system",
            content: `${CLASSIFICATION_PROMPT}\nwhatif이면 whatifKind를 date(날짜), time(시간대), fee(요금), type(유형), weather(비·눈), similar(유사 행사) 중 하나로 분류한다. 바꿀 값은 추측하지 않는다.`,
          },
          { role: "user", content: JSON.stringify({ text: ctx.input }) },
        ],
        recordingKey: `classify:${ctx.input}`,
      });
      const parsed: unknown = JSON.parse(completion.content);
      return result(
        validateFollowup(parsed) ? parsed : { intent: "out_of_scope" },
        "LLM",
      );
    } catch {
      return result({ intent: "out_of_scope" }, "LLM");
    }
  },
};

// 실행기 바깥의 예산 만료도 재호출 없이 범위 안내로 마무리한다
export async function classify(
  text: string,
  execute: Executor,
  deadline: Deadline,
) {
  try {
    return await execute(classifier, text, "후속 요청의 의도를 확인해요.");
  } catch {
    deadline.check();
    return execute(
      {
        ...classifier,
        usesLlm: false,
        budgetMs: 1_000,
        // 시간 초과 뒤에도 분류 결과와 실제 시도한 방식을 기록한다
        async run() {
          return result({ intent: "out_of_scope" }, "LLM");
        },
      },
      "",
      "후속 요청의 범위를 안내해요.",
    );
  }
}
