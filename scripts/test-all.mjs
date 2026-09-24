// 있는 서비스의 테스트를 전부 돌리고 결과를 한 표로 모은다
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// 서비스별 테스트 명령: 표시 파일이 있을 때만 실행한다
const SUITES = [
  { name: "contracts", marker: "packages/contracts/package.json", cmd: "npm", args: ["-w", "packages/contracts", "run", "check"] },
  { name: "forecast", marker: "services/forecast/src/crowdcast/api", cmd: "uv", args: ["run", "--package", "crowdcast-forecast", "pytest", "-q", "services/forecast/tests"] },
  { name: "knowledge", marker: "services/knowledge/src/knowledge/api", cmd: "uv", args: ["run", "--package", "crowdcast-knowledge", "pytest", "-q", "services/knowledge/tests"] },
  { name: "gateway", marker: "services/gateway/package.json", cmd: "npm", args: ["-w", "services/gateway", "test"] },
  { name: "records", marker: "services/records/composer.json", cmd: "composer", args: ["test"], cwd: "services/records" },
  { name: "web", marker: "apps/web/package.json", cmd: "npm", args: ["-w", "apps/web", "test"] },
  { name: "graph", marker: ".harness/graph.json", cmd: "node", args: ["scripts/harness/graph.mjs", "validate"] },
];

// 실행하고 통과·실패·없음을 모은다
const rows = [];
for (const s of SUITES) {
  if (!existsSync(join(ROOT, s.marker))) { rows.push([s.name, "없음"]); continue; }
  console.log(`\n▶ ${s.name}`);
  const r = spawnSync(s.cmd, s.args, { cwd: join(ROOT, s.cwd ?? ""), stdio: "inherit" });
  rows.push([s.name, r.status === 0 ? "통과" : `실패(${r.status})`]);
}

// 요약표를 찍고, 하나라도 실패면 실패로 끝낸다
console.log("\n── 테스트 요약 ──");
for (const [n, st] of rows) console.log(`${n.padEnd(10)} ${st}`);
process.exit(rows.some(([, st]) => st.startsWith("실패")) ? 1 : 0);
