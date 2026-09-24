// 계약 스키마에서 TS 타입(web·gateway용)과 pydantic v2 모델(forecast·knowledge용)을 만든다 — 생성물은 커밋하고 손으로 고치지 않는다
import { readdirSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { compileFromFile } from "json-schema-to-typescript";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMAS = join(ROOT, "schemas");
const TS_OUT = join(ROOT, "generated", "ts");
const PY_OUT = join(ROOT, "generated", "python", "crowdcast_contracts");
const DATAMODEL_CODEGEN = "datamodel-code-generator==0.83.0";
const BANNER = "/* 자동 생성 — packages/contracts/schemas에서 npm run contracts:gen 으로 만든다. 직접 고치지 않는다 */";

// 스키마 파일 이름을 타입 이름으로 바꾼다(forecast → Forecast, sse-event → SseEvent)
const typeName = (file) => file.replace(".schema.json", "").split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join("");

// TS: 스키마마다 .d.ts 하나, index.d.ts에서 모두 내보낸다
rmSync(TS_OUT, { recursive: true, force: true });
mkdirSync(TS_OUT, { recursive: true });
const files = readdirSync(SCHEMAS).filter((f) => f.endsWith(".schema.json")).sort();
for (const f of files) {
  const ts = await compileFromFile(join(SCHEMAS, f), {
    cwd: SCHEMAS, bannerComment: BANNER, declareExternallyReferenced: true, additionalProperties: false,
    style: { singleQuote: false, semi: true }, customName: (schema) => (schema.$id?.endsWith(f) ? typeName(f) : undefined),
  });
  writeFileSync(join(TS_OUT, f.replace(".schema.json", ".d.ts")), ts);
}
writeFileSync(join(TS_OUT, "index.d.ts"), `${BANNER}\n${files.filter((f) => f !== "common.schema.json").map((f) => `export type { ${typeName(f)} } from "./${f.replace(".schema.json", "")}";`).join("\n")}\n`);

// Python: 한국어 title은 클래스 이름이 될 수 없으므로, 임시 폴더에 영문 클래스 이름(파일 이름 기반)으로 바꾼 사본을 만든다
rmSync(PY_OUT, { recursive: true, force: true });
// 임시 폴더 이름을 고정해(schemas) 생성물 머리 주석이 실행마다 달라지지 않게 한다
const tmp = join(mkdtempSync(join(tmpdir(), "crowdcast-contracts-")), "schemas");
mkdirSync(tmp);
for (const f of files) {
  const schema = JSON.parse(readFileSync(join(SCHEMAS, f), "utf8"));
  schema.description = `${schema.title}: ${schema.description ?? ""}`.trim();
  schema.title = typeName(f);
  writeFileSync(join(tmp, f), JSON.stringify(schema, null, 2));
}

// datamodel-code-generator로 pydantic v2 모델 패키지를 만든다(버전 고정)
const r = spawnSync("uvx", ["--python", "3.12", "--from", DATAMODEL_CODEGEN, "datamodel-codegen",
  "--input", tmp, "--input-file-type", "jsonschema", "--output", PY_OUT,
  "--output-model-type", "pydantic_v2.BaseModel", "--target-python-version", "3.12",
  "--use-annotated", "--field-constraints", "--disable-timestamp", "--use-standard-collections", "--formatters", "builtin"], { stdio: "inherit" });
if (r.status !== 0) process.exit(r.status ?? 1);
console.log(`✓ TS ${files.length}개 → generated/ts, pydantic → generated/python`);
