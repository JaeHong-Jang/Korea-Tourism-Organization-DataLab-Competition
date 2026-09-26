// 구현 그래프(.harness/graph.json)의 상태를 관리하고 검토 실패 시 되돌림을 전파하는 CLI
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const GRAPH_PATH = join(ROOT, ".harness", "graph.json");
const STATE_PATH = join(ROOT, ".harness", "state.json");
const DONE_AT_START = new Set(["plan"]);
const STATUSES = ["todo", "running", "blocked", "failed", "stale", "done"];

// 그래프 정의와 상태 파일을 읽고, 상태가 없으면 계획 노드만 완료로 둔 기본 상태를 만든다
function load() {
  const graph = JSON.parse(readFileSync(GRAPH_PATH, "utf8"));
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const state = existsSync(STATE_PATH)
    ? JSON.parse(readFileSync(STATE_PATH, "utf8"))
    : { nodes: {}, history: [] };
  for (const n of graph.nodes) {
    state.nodes[n.id] ??= { status: DONE_AT_START.has(n.type) ? "done" : "todo" };
  }
  return { graph, byId, state };
}

// 상태 파일을 사람이 읽기 좋은 형태로 저장한다
function save(state) {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 1) + "\n");
}

// 노드 id → 그 노드에 의존하는 노드 목록(역방향 간선)을 만든다
function dependents(graph) {
  const rev = new Map(graph.nodes.map((n) => [n.id, []]));
  for (const n of graph.nodes) for (const d of n.deps ?? []) rev.get(d)?.push(n.id);
  return rev;
}

// 한 노드에서 출발해 도달할 수 있는 모든 노드(자신 제외)를 모은다
function reach(start, edges) {
  const seen = new Set();
  const stack = [...(edges.get(start) ?? [])];
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(edges.get(id) ?? []));
  }
  return seen;
}

// 선행 노드가 모두 완료이고 자신은 아직 할 일(todo·stale)인 노드를 고른다
function readyNodes(graph, state) {
  return graph.nodes.filter((n) => {
    const s = state.nodes[n.id].status;
    return (s === "todo" || s === "stale") && (n.deps ?? []).every((d) => state.nodes[d]?.status === "done");
  });
}

// 기록을 남기고 상태를 바꾼다
function setStatus(state, id, status, extra = {}) {
  state.nodes[id] = { ...state.nodes[id], status, updated: new Date().toISOString(), ...extra };
  state.history.push({ at: state.nodes[id].updated, id, status, ...extra });
}

// 정의 검사: id 중복, 없는 선행, 순환, 검토 되돌림 대상, 고아 노드
function validate(graph) {
  const errors = [];
  const ids = new Set();
  for (const n of graph.nodes) {
    if (ids.has(n.id)) errors.push(`중복 id ${n.id}`);
    ids.add(n.id);
  }
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));

  // 선행 존재·task 필수 필드
  for (const n of graph.nodes) {
    for (const d of n.deps ?? []) if (!byId.has(d)) errors.push(`${n.id}: 없는 선행 ${d}`);
    if (n.type === "task" && (!n.lane || !n.accept)) errors.push(`${n.id}: task는 lane·accept 필요`);
    if (n.type === "review" && !(n.on_fail?.length && n.checklist?.length)) errors.push(`${n.id}: review는 checklist·on_fail 필요`);
  }

  // 순환 검사(위상 정렬)
  const indeg = new Map(graph.nodes.map((n) => [n.id, (n.deps ?? []).length]));
  const rev = dependents(graph);
  const queue = [...indeg].filter(([, v]) => v === 0).map(([k]) => k);
  let seen = 0;
  while (queue.length) {
    const id = queue.shift();
    seen++;
    for (const m of rev.get(id)) { indeg.set(m, indeg.get(m) - 1); if (indeg.get(m) === 0) queue.push(m); }
  }
  if (seen !== graph.nodes.length) errors.push("순환이 있다");

  // 검토의 되돌림 대상은 그 검토의 조상이어야 한다
  const fwd = new Map(graph.nodes.map((n) => [n.id, n.deps ?? []]));
  for (const n of graph.nodes.filter((x) => x.type === "review")) {
    const ancestors = reach(n.id, fwd);
    for (const t of n.on_fail) if (!ancestors.has(t)) errors.push(`${n.id}: 되돌림 대상 ${t}가 조상이 아니다`);
  }

  // 마지막 게이트를 빼면 모든 노드는 누군가의 선행이어야 한다(검토를 피해 가는 노드 금지)
  for (const n of graph.nodes) if (n.id !== "G4" && rev.get(n.id).length === 0) errors.push(`${n.id}: 아무 노드도 의존하지 않는다(검토 누락)`);
  return errors;
}

// 레인·상태별 요약과 지금 시작할 수 있는 노드를 출력한다
function status(graph, state, lane) {
  const count = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const n of graph.nodes) count[state.nodes[n.id].status]++;
  console.log(STATUSES.map((s) => `${s} ${count[s]}`).join(" · "));
  const rows = graph.nodes.filter((n) => !lane || n.lane === lane);
  for (const n of rows) {
    if (n.type === "plan") continue;
    const s = state.nodes[n.id];
    const note = s.note ? ` — ${s.note}` : "";
    console.log(`${s.status.padEnd(8)} ${n.id.padEnd(7)} ${(n.lane ?? n.type).padEnd(6)} ${n.title}${note}`);
  }
  console.log("\n지금 시작 가능:", readyNodes(graph, state).map((n) => n.id).join(" ") || "없음");
}

// 노드를 다시 열고, 이미 끝났거나 진행 중이던 하위 노드를 모두 재검증 필요(stale)로 바꾼다
function reopen(graph, state, target, reason, by) {
  const downstream = reach(target, dependents(graph));
  setStatus(state, target, "todo", { note: `되돌림: ${reason}`, by });
  const staled = [];
  for (const id of downstream) {
    const s = state.nodes[id].status;
    if (s === "done" || s === "running" || s === "failed") { setStatus(state, id, "stale", { note: `상위 ${target} 되돌림`, by }); staled.push(id); }
  }
  return staled;
}

// Mermaid 흐름도로 그래프를 그린다(상태별 색)
function mermaid(graph, state) {
  const lines = ["flowchart LR"];
  for (const n of graph.nodes) {
    const shape = n.type === "review" ? `{{"${n.id} ${n.title}"}}` : n.type === "gate" ? `[/"${n.id}"/]` : `["${n.id} ${n.title}"]`;
    lines.push(`  ${n.id.replace(/-/g, "_")}${shape}:::${state.nodes[n.id].status}`);
    for (const d of n.deps ?? []) lines.push(`  ${d.replace(/-/g, "_")} --> ${n.id.replace(/-/g, "_")}`);
  }
  lines.push("  classDef done fill:#e3f3e3,stroke:#0ca30c", "  classDef todo fill:#fff,stroke:#898781",
    "  classDef running fill:#e3edfb,stroke:#256abf", "  classDef stale fill:#fff4dc,stroke:#fab219",
    "  classDef failed fill:#fbe4e4,stroke:#d03b3b", "  classDef blocked fill:#eee,stroke:#52514e");
  return lines.join("\n");
}

// 명령줄 인자 파싱: 명령, 대상 id, --키 값
function parseArgs(argv) {
  const [cmd, id, ...rest] = argv;
  const opts = {};
  for (let i = 0; i < rest.length; i++) if (rest[i].startsWith("--")) opts[rest[i].slice(2)] = rest[i + 1]?.startsWith("--") ? true : rest[++i];
  return { cmd, id, opts };
}

// 명령 실행
const { cmd, id, opts } = parseArgs(process.argv.slice(2));
const { graph, byId, state } = load();
const need = (cond, msg) => { if (!cond) { console.error(msg); process.exit(1); } };

if (cmd === "validate") {
  const errors = validate(graph);
  console.log(errors.length ? errors.join("\n") : `그래프 정상: 노드 ${graph.nodes.length}개`);
  process.exit(errors.length ? 1 : 0);
} else if (cmd === "status") {
  status(graph, state, opts.lane);
} else if (cmd === "ready") {
  console.log(readyNodes(graph, state).map((n) => `${n.id}\t${n.lane ?? n.type}\t${n.title}`).join("\n") || "없음");
} else if (cmd === "start") {
  need(byId.has(id), `없는 노드 ${id}`);
  need(opts.force || readyNodes(graph, state).some((n) => n.id === id), `${id}는 아직 선행이 끝나지 않았다(--force로 강제)`);
  setStatus(state, id, "running", { by: opts.by });
  save(state);
  console.log(`${id} → running`);
} else if (cmd === "done") {
  need(byId.has(id), `없는 노드 ${id}`);
  need(byId.get(id).type === "human" || opts.evidence, "--evidence 필요(수용 기준 실행 결과·리뷰 결론)");
  setStatus(state, id, "done", { evidence: opts.evidence, by: opts.by, note: opts.note });
  save(state);
  console.log(`${id} → done`);
} else if (cmd === "fail") {
  const node = byId.get(id);
  need(node?.type === "review", "fail은 검토(R-) 노드에만 쓴다. 일반 노드는 reopen");
  need(node.on_fail.includes(opts.to), `되돌림 대상은 ${node.on_fail.join(", ")} 중 하나`);
  need(opts.reason, "--reason 필요");
  setStatus(state, id, "failed", { note: `→ ${opts.to}: ${opts.reason}`, by: opts.by });
  const staled = reopen(graph, state, opts.to, `${id} 실패 — ${opts.reason}`, opts.by);
  save(state);
  console.log(`${id} 실패 → ${opts.to} 다시 열림, 재검증 필요 ${staled.length}개: ${staled.join(" ")}`);
} else if (cmd === "reopen") {
  need(byId.has(id) && opts.reason, "reopen <id> --reason <이유>");
  const staled = reopen(graph, state, id, opts.reason, opts.by);
  save(state);
  console.log(`${id} 다시 열림, 재검증 필요 ${staled.length}개: ${staled.join(" ")}`);
} else if (cmd === "block") {
  need(byId.has(id) && opts.reason, "block <id> --reason <이유>");
  setStatus(state, id, "blocked", { note: opts.reason, by: opts.by });
  save(state);
  console.log(`${id} → blocked`);
} else if (cmd === "note") {
  need(byId.has(id) && opts.text, "note <id> --text <메모>");
  state.nodes[id].note = opts.text;
  save(state);
} else if (cmd === "mermaid") {
  console.log(mermaid(graph, state));
} else {
  console.log("사용법: node scripts/harness/graph.mjs <validate|status [--lane L]|ready|start ID|done ID --evidence ..|fail R-xx --to ID --reason ..|reopen ID --reason ..|block ID --reason ..|note ID --text ..|mermaid>");
}
