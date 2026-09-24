// 계약 검사: 스키마 컴파일, 픽스처를 TS·Python·PHP에서 검증해 판정이 같고 기대(valid-/invalid-)와 맞는지, OpenAPI·SSE 문서 참조를 확인한다
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import YAML from "yaml";

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

// OpenAPI의 $ref가 실제 스키마 파일을 가리키는지 본다
const openapiDir = join(ROOT, "openapi");
for (const f of existsSync(openapiDir) ? readdirSync(openapiDir).filter((x) => x.endsWith(".yaml")) : []) {
  const text = readFileSync(join(openapiDir, f), "utf8");
  YAML.parse(text);
  for (const m of text.matchAll(/\$ref:\s*["']?\.\.\/schemas\/([a-z-]+)\.schema\.json/g)) if (!schemas[m[1]]) errors.push(`${f}: 없는 스키마 ${m[1]}`);
}

// SSE 문서가 스키마의 이벤트 이름을 모두 다루는지 본다
const sseEvents = schemas["sse-event"].properties.event.enum;
const sseDoc = existsSync(join(ROOT, "sse-events.md")) ? readFileSync(join(ROOT, "sse-events.md"), "utf8") : "";
for (const e of sseEvents) if (!sseDoc.includes(`\`${e}\``)) errors.push(`sse-events.md에 ${e} 설명이 없다`);

console.log(rows.join("\n"));
console.log(`\n스키마 ${schemaFiles.length}개 · 픽스처 ${rows.length}개 · 오류 ${errors.length}개`);
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
