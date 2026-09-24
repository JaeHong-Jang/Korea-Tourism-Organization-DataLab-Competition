// 계약 패키지의 JSON Schema를 $id로 등록해 상대 참조까지 Ajv 2020으로 검증한다
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

// 계약 검사기와 같은 옵션을 사용하고 데이터를 보정하거나 속성을 지우지 않는다
export const contractRegistry = new Ajv2020({
  allErrors: true,
  strict: true,
  strictRequired: false,
  allowUnionTypes: true,
});
addFormats(contractRegistry);

// exports로 찾은 스키마 디렉터리를 읽어 작업 디렉터리에 관계없이 참조를 연결한다
const schemaDirectory = dirname(
  createRequire(import.meta.url).resolve(
    "@crowdcast/contracts/schemas/common.schema.json",
  ),
);
for (const file of readdirSync(schemaDirectory).sort()) {
  if (!file.endsWith(".schema.json")) continue;
  const schema = JSON.parse(readFileSync(join(schemaDirectory, file), "utf8"));
  contractRegistry.addSchema(schema, schema.$id);
}
