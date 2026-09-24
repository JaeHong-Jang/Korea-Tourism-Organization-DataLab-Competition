// 계약 검사: 스키마 컴파일, 픽스처 판정(TS·Python·PHP 일치), 참조 무결성, 카드 투영, SSE 순서, JSON-LD 트리플, OpenAPI·SSE 문서 참조를 확인한다
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import YAML from "yaml";
import { changesContent, masterSets, refProblems, sessionScope } from "../rules/integrity.mjs";
import { publishProblems, published } from "../rules/claim-lifecycle.mjs";
import { cardDiff } from "../rules/card-projection.mjs";
import { sequenceProblems } from "../rules/sse-sequence.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

// 스키마를 모두 읽어 Ajv 2020에 등록하고 컴파일되는지 본다
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true });
addFormats(ajv);
const schemaFiles = readdirSync(join(ROOT, "schemas")).filter((f) => f.endsWith(".schema.json"));
const schemas = Object.fromEntries(schemaFiles.map((f) => [f.replace(".schema.json", ""), JSON.parse(readFileSync(join(ROOT, "schemas", f), "utf8"))]));
for (const s of Object.values(schemas)) ajv.addSchema(s);
for (const [name, s] of Object.entries(schemas)) {
  try { ajv.getSchema(s.$id) ?? ajv.compile(s); } catch (e) { errors.push(`스키마 ${name} 컴파일 실패: ${e.message}`); }
}

// TS(Ajv)로 픽스처를 검증한다
const ts = {};
for (const dir of readdirSync(join(ROOT, "fixtures"), { withFileTypes: true }).filter((d) => d.isDirectory())) {
  const validate = ajv.getSchema(schemas[dir.name]?.$id ?? "");
  if (!validate) { errors.push(`픽스처 폴더 ${dir.name}에 맞는 스키마가 없다`); continue; }
  for (const f of readdirSync(join(ROOT, "fixtures", dir.name)).filter((x) => x.endsWith(".json")).sort()) {
    ts[`${dir.name}/${f}`] = validate(JSON.parse(readFileSync(join(ROOT, "fixtures", dir.name, f), "utf8")));
  }
}

// Python(jsonschema)과 PHP(opis) 결과를 받는다
function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8" });
  if (r.status !== 0) { errors.push(`${cmd} 실패: ${(r.stderr || r.stdout).slice(-400)}`); return null; }
  return JSON.parse(r.stdout);
}
const py = run("uv", ["run", "--no-project", "--python", "3.12", "--with", "jsonschema[format]>=4.23", "--with", "referencing", "python", "check/python_check.py"], ROOT);
const phpDir = join(ROOT, "check", "php");
if (!existsSync(join(phpDir, "vendor"))) {
  // PHP 검증 도구의 의존성(opis/json-schema)을 처음 한 번 설치한다
  const r = spawnSync("composer", ["install", "--no-interaction", "--quiet"], { cwd: phpDir, encoding: "utf8" });
  if (r.status !== 0) errors.push(`composer install 실패: ${r.stderr.slice(-400)}`);
}
const php = run("php", ["check.php"], phpDir);

// 세 언어 판정이 같고, 파일 이름의 기대와 맞는지 비교한다
const rows = [];
for (const key of Object.keys(ts).sort()) {
  const expect = basename(key).startsWith("valid-");
  const got = [ts[key], py?.[key], php?.[key]];
  const ok = got.every((g) => g === expect);
  if (!ok) errors.push(`판정 불일치 ${key}: 기대 ${expect} / TS ${got[0]} · Python ${got[1]} · PHP ${got[2]}`);
  rows.push(`${ok ? "✓" : "✗"} ${key.padEnd(46)} 기대 ${expect ? "통과" : "거부"}  TS ${got[0]} · PY ${got[1]} · PHP ${got[2]}`);
}

// 참조 무결성: 기준 id(master-ids.json) + 등록된 모델 카드 id를 기준 그래프로 보고 rules/integrity.mjs로 판정한다
const readJson = (...p) => JSON.parse(readFileSync(join(ROOT, ...p), "utf8"));
const modelRunIds = readdirSync(join(ROOT, "fixtures", "model-card")).filter((f) => f.startsWith("valid-")).map((f) => readJson("fixtures", "model-card", f).id);
const master = masterSets(readJson("jsonld", "master-ids.json"), modelRunIds);
const integrityDir = join(ROOT, "fixtures-integrity");
// 세션 범위: 종류 X를 검사할 때는 적재 순서에서 X보다 앞의 문서만 세션에 있다고 본다(예보서는 범위 없이)
const scopeSpec = readJson("fixtures-integrity", "session-scope.json");
const scopeFor = (kind) => {
  if (kind === "forecast-report") return null;
  const upto = scopeSpec.loadOrder.findIndex(([k]) => k === kind);
  const before = scopeSpec.loadOrder.slice(0, upto < 0 ? undefined : upto).filter(([, file]) => file);
  return sessionScope(scopeSpec.sessionId, before.map(([schema, file]) => ({ schema, doc: readJson(file) })));
};
for (const kind of existsSync(integrityDir) ? readdirSync(integrityDir, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== "sequences").map((d) => d.name) : []) {
  const validate = ajv.getSchema(schemas[kind].$id);
  const scope = scopeFor(kind);
  for (const f of readdirSync(join(integrityDir, kind)).sort()) {
    const doc = JSON.parse(readFileSync(join(integrityDir, kind, f), "utf8"));
    const schemaOk = validate(doc);
    const problems = refProblems(doc, kind, master, scope);
    const expect = f.startsWith("valid-");
    const ok = schemaOk && (problems.length === 0) === expect;
    if (!ok) errors.push(`무결성 ${kind}/${f}: 스키마 ${schemaOk}, 끊긴 참조 ${problems.length}개(기대 ${expect ? "0" : "1개 이상"}) ${problems.join("; ")}`);
    rows.push(`${ok ? "✓" : "✗"} 무결성 ${(kind + "/" + f).padEnd(44)} 끊긴 참조 ${problems.length}${expect ? "" : ` (${problems[0] ?? "—"})`}`);
  }
}

// 적재 순서 시퀀스: 단계마다 스키마 → 무결성(앞 단계까지를 세션 범위로) → 통과하면 적재하고 내용 revision 계산, publish 단계는 수명 주기 규칙
// 단계의 revisionAfter는 계약이 정한 값이다(T-601의 /facts 응답이 같아야 한다)
function sequenceRun(spec) {
  const loaded = [];
  const problems = [];
  let revision = 0;
  spec.steps.forEach((st, i) => {
    const scope = sessionScope(spec.sessionId, loaded);
    if (st.publish) {
      for (const id of st.publish) {
        const p = publishProblems(scope.claims.get(id), revision);
        problems.push(...p.map((x) => `#${i} ${x}`));
        if (!p.length) loaded.push({ schema: "claim", doc: published(scope.claims.get(id)), via: "publish" });
      }
    } else {
      const p = [...(ajv.getSchema(schemas[st.facts].$id)(st.doc) ? [] : [`${st.facts} 스키마 위반`]), ...refProblems(st.doc, st.facts, master, scope)];
      problems.push(...p.map((x) => `#${i} ${x}`));
      if (!p.length) {
        if (changesContent(scope, st.facts, st.doc)) revision += 1;
        loaded.push({ schema: st.facts, doc: st.doc });
      }
    }
    if (st.revisionAfter !== undefined && st.revisionAfter !== revision) problems.push(`#${i} revision ${revision}(계약 값 ${st.revisionAfter})`);
  });
  return problems;
}
const seqDir = join(integrityDir, "sequences");
for (const f of existsSync(seqDir) ? readdirSync(seqDir).sort() : []) {
  const problems = sequenceRun(readJson("fixtures-integrity", "sequences", f));
  const expect = f.startsWith("valid-");
  const ok = (problems.length === 0) === expect;
  if (!ok) errors.push(`적재 순서 ${f}: ${problems.join("; ") || "위반을 잡지 못함"}`);
  rows.push(`${ok ? "✓" : "✗"} 적재 순서 ${f.padEnd(40)} 위반 ${problems.length}${expect ? "" : ` (${problems[0] ?? "—"})`}`);
}

// 정상 픽스처끼리의 일관성: 스키마 픽스처의 정상 예보서도 무결성 통과, 숫자 카드 = 예보의 투영
const forecastFx = readJson("fixtures", "forecast", "valid-yeongjong.json");
const coherence = [
  ["forecast-report/valid-yeongjong.json 무결성", refProblems(readJson("fixtures", "forecast-report", "valid-yeongjong.json"), "forecast-report", master)],
  ["forecast-card/valid-yeongjong.json = projectCard(forecast)", cardDiff(readJson("fixtures", "forecast-card", "valid-yeongjong.json"), forecastFx).map((k) => `다른 칸 ${k}`)],
  ["sse-event/valid-forecast-card.json = projectCard(forecast)", cardDiff(readJson("fixtures", "sse-event", "valid-forecast-card.json").data, forecastFx).map((k) => `다른 칸 ${k}`)],
];
for (const [name, problems] of coherence) {
  if (problems.length) errors.push(`일관성 ${name}: ${problems.join("; ")}`);
  rows.push(`${problems.length ? "✗" : "✓"} 일관성 ${name}`);
}

// SSE 순서: 각 이벤트가 스키마를 통과하고, 순서 규칙(rules/sse-sequence.mjs) 판정이 파일 이름의 기대와 맞는지
const sseValidate = ajv.getSchema(schemas["sse-event"].$id);
const sseDir = join(ROOT, "fixtures-sse");
for (const f of existsSync(sseDir) ? readdirSync(sseDir).filter((x) => x.endsWith(".json")).sort() : []) {
  // 파일이 배열이면 새 예보, {mode, forecastId, events}면 그 문맥(후속 요청)
  const spec = JSON.parse(readFileSync(join(sseDir, f), "utf8"));
  const [events, ctx] = Array.isArray(spec) ? [spec, { mode: "new" }] : [spec.events, { mode: spec.mode, forecastId: spec.forecastId }];
  const bad = events.map((e, i) => (sseValidate(e) ? null : `#${i} ${e.event} 스키마 위반`)).filter(Boolean);
  const problems = sequenceProblems(events, ctx);
  const expect = f.startsWith("valid-");
  const ok = bad.length === 0 && (problems.length === 0) === expect;
  if (!ok) errors.push(`SSE 순서 ${f}: ${[...bad, ...problems].join("; ") || "위반을 잡지 못함"}`);
  rows.push(`${ok ? "✓" : "✗"} SSE 순서 ${f.padEnd(38)} 이벤트 ${events.length} · 위반 ${problems.length}`);
}

// JSON-LD 변환: types.json + 컨텍스트로 바꾼 그래프에 기대 트리플이 모두 있는지(pyld·rdflib)
const ld = spawnSync("uv", ["run", "--no-project", "--python", "3.12", "--with", "pyld", "--with", "rdflib", "python", "check/jsonld_check.py"], { cwd: ROOT, encoding: "utf8" });
try {
  for (const r of JSON.parse(ld.stdout)) {
    const bad = r.missing.length + r.unexpected.length + r.illTyped.length;
    rows.push(`${bad ? "✗" : "✓"} JSON-LD ${r.expected.padEnd(38)} 트리플 ${r.triples} · 기대 ${r.checked} · 빠짐 ${r.missing.length} · 금지 ${r.unexpected.length} · 형식 오류 ${r.illTyped.length}`);
    for (const m of r.missing) errors.push(`JSON-LD ${r.expected}: 빠진 트리플 ${m.join(" ")}`);
    for (const m of r.unexpected) errors.push(`JSON-LD ${r.expected}: 있으면 안 되는 트리플 ${m.join(" ")}`);
    for (const m of r.illTyped) errors.push(`JSON-LD ${r.expected}: 형식 오류 리터럴 ${m.join(" ")}`);
  }
} catch { errors.push(`JSON-LD 검사 실패: ${(ld.stderr || ld.stdout).slice(-400)}`); }

// OpenAPI의 $ref가 실제 스키마 파일을 가리키는지 본다
const openapiDir = join(ROOT, "openapi");
for (const f of existsSync(openapiDir) ? readdirSync(openapiDir).filter((x) => x.endsWith(".yaml")) : []) {
  const text = readFileSync(join(openapiDir, f), "utf8");
  YAML.parse(text);
  for (const m of text.matchAll(/\$ref:\s*["']?\.\.\/schemas\/([a-z-]+)\.schema\.json(#[^"'\s]*)?/g)) {
    if (!schemas[m[1]]) { errors.push(`${f}: 없는 스키마 ${m[1]}`); continue; }
    // #/$defs/… 조각이 있으면 그 위치가 실제로 있는지 따라가 본다
    const target = (m[2] ?? "#").slice(1).split("/").filter(Boolean).reduce((o, k) => o?.[k], schemas[m[1]]);
    if (!target) errors.push(`${f}: ${m[1]}${m[2]} 위치가 없다`);
  }
}

// SSE 문서가 스키마의 이벤트 이름을 모두 다루는지 본다
const sseEvents = schemas["sse-event"].properties.event.enum;
const sseDoc = existsSync(join(ROOT, "sse-events.md")) ? readFileSync(join(ROOT, "sse-events.md"), "utf8") : "";
for (const e of sseEvents) if (!sseDoc.includes(`\`${e}\``)) errors.push(`sse-events.md에 ${e} 설명이 없다`);

console.log(rows.join("\n"));
console.log(`\n스키마 ${schemaFiles.length}개 · 픽스처 ${rows.length}개 · 오류 ${errors.length}개`);
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
