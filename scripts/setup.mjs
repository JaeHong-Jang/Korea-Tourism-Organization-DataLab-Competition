// 처음 한 번 실행하는 설치 스크립트 — 런타임 확인, 의존성 설치, 지도·경계 자산 받기
import { execSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// 명령이 있는지와 버전을 확인한다
function version(cmd, arg = "--version") {
  try {
    return execSync(`${cmd} ${arg}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split("\n")[0].trim();
  } catch {
    return null;
  }
}

// 단계 하나를 실행하고 실패하면 멈춘다
function step(title, cmd, args, cwd = ROOT) {
  console.log(`\n▶ ${title}`);
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit" });
  if (r.status !== 0) {
    console.error(`✗ ${title} 실패`);
    process.exit(r.status ?? 1);
  }
}

// 1) 런타임 확인
const need = { node: version("node"), npm: version("npm"), uv: version("uv"), php: version("php", "-v"), composer: version("composer", "-V") };
for (const [k, v] of Object.entries(need)) console.log(`${v ? "✓" : "✗"} ${k.padEnd(8)} ${v ?? "없음"}`);
if (!need.uv || !need.node) process.exit(1);
if (!existsSync(join(ROOT, ".env"))) console.log("\n! .env가 없다 — .env.example을 복사해 키를 넣는다");

// 2) 의존성 설치(있는 것만)
step("Python 3.12 준비", "uv", ["python", "install", "3.12"]);
step("Python 의존성(forecast·knowledge)", "uv", ["sync", "--all-packages"]);
step("Node 의존성(workspaces)", "npm", ["install"]);
if (need.composer && existsSync(join(ROOT, "services/records/composer.json"))) {
  step("PHP 의존성(records)", "composer", ["install", "--no-interaction"], join(ROOT, "services/records"));
}

// 3) 지도·경계 자산
step("지도·경계 자산", "node", ["scripts/fetch-assets.mjs"]);
console.log("\n✓ 설치 완료 — npm run dev");
