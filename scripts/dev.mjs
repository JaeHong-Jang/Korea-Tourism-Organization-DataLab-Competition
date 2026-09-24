// 앱 서비스 5개를 한 번에 띄우고 health를 기다린 뒤 주소를 알려 준다(Ollama 상태는 따로 표시만 한다)
import { spawn, execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HEALTH_TIMEOUT_MS = 60_000;

// 서비스 목록: 각 레인의 골격 task가 이 시작 명령과 health 주소를 만족해야 한다
const SERVICES = [
  { name: "forecast", color: 34, marker: "services/forecast/src/crowdcast/api/app.py",
    cmd: "uv", args: ["run", "--package", "crowdcast-forecast", "uvicorn", "crowdcast.api.app:app", "--port", "8010"],
    health: "http://127.0.0.1:8010/health" },
  { name: "knowledge", color: 36, marker: "services/knowledge/src/knowledge/api/app.py",
    cmd: "uv", args: ["run", "--package", "crowdcast-knowledge", "uvicorn", "knowledge.api.app:app", "--port", "8020"],
    health: "http://127.0.0.1:8020/health" },
  { name: "records", color: 35, marker: "services/records/public/index.php",
    cmd: "php", args: ["-S", "127.0.0.1:8030", "-t", "services/records/public"],
    health: "http://127.0.0.1:8030/health" },
  { name: "gateway", color: 33, marker: "services/gateway/package.json",
    cmd: "npm", args: ["-w", "services/gateway", "run", "dev"],
    health: "http://127.0.0.1:8787/api/health" },
  { name: "web", color: 32, marker: "apps/web/package.json",
    cmd: "npm", args: ["-w", "apps/web", "run", "dev", "--", "--port", "5173", "--strictPort"],
    health: "http://127.0.0.1:5173/" },
];

// .env를 읽어 환경변수로 넘긴다(이미 있는 값은 덮어쓰지 않는다)
function loadEnv() {
  const path = join(ROOT, ".env");
  const env = { ...process.env };
  if (!existsSync(path)) return env;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && env[m[1]] === undefined) env[m[1]] = m[2];
  }
  return env;
}

// Ollama 주소: .env 값 → WSL 기본 게이트웨이(Windows 호스트) → 127.0.0.1 순서
function ollamaCandidates(env) {
  const list = [];
  if (env.OLLAMA_HOST) list.push(env.OLLAMA_HOST.startsWith("http") ? env.OLLAMA_HOST : `http://${env.OLLAMA_HOST}`);
  try {
    const gw = execSync("ip route show default", { encoding: "utf8" }).split(" ")[2];
    if (gw) list.push(`http://${gw}:11434`);
  } catch { /* WSL이 아니면 게이트웨이를 찾지 않는다 */ }
  list.push("http://127.0.0.1:11434");
  return [...new Set(list)];
}

// 주소 하나를 짧게 찔러 본다
async function probe(url, timeoutMs = 2000) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch {
    return false;
  }
}

// health가 초록이 될 때까지 기다린다(최대 60초)
async function waitHealthy(url) {
  const until = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < until) {
    if (await probe(url)) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

// 서비스 하나를 띄우고 로그 앞에 이름을 붙인다
function start(svc, env) {
  const child = spawn(svc.cmd, svc.args, { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
  const tag = `\x1b[${svc.color}m[${svc.name}]\x1b[0m `;
  const pipe = (stream) => stream.on("data", (buf) => {
    for (const line of buf.toString().split("\n")) if (line.trim()) process.stdout.write(tag + line + "\n");
  });
  pipe(child.stdout);
  pipe(child.stderr);
  child.on("exit", (code) => process.stdout.write(`${tag}종료(code ${code})\n`));
  return child;
}

// 실행: 있는 서비스만 띄우고, 없는 서비스는 "아직 없음"으로 알린다
const env = loadEnv();
const hosts = ollamaCandidates(env);
let ollama = null;
for (const h of hosts) if (await probe(`${h}/api/version`)) { ollama = h; break; }
if (ollama) env.OLLAMA_HOST = ollama;

const children = [];
const present = SERVICES.filter((s) => existsSync(join(ROOT, s.marker)));
for (const s of SERVICES.filter((x) => !present.includes(x))) console.log(`· ${s.name}: 아직 없음(${s.marker})`);
for (const s of present) children.push(start(s, env));

// Ctrl+C로 전부 함께 끈다
const stopAll = () => { for (const c of children) c.kill("SIGTERM"); process.exit(0); };
process.on("SIGINT", stopAll);
process.on("SIGTERM", stopAll);

// health 결과와 주소를 출력한다
const results = await Promise.all(present.map(async (s) => [s, await waitHealthy(s.health)]));
console.log("\n── 인파예보 로컬 실행 ──");
for (const [s, ok] of results) console.log(`${ok ? "✓" : "✗"} ${s.name.padEnd(9)} ${s.health}`);
console.log(`${ollama ? "✓" : "·"} ollama    ${ollama ?? "연결 안 됨 — 템플릿 모드로 동작"} (${hosts.join(", ")})`);
if (present.some((s) => s.name === "web")) console.log("\n열기: http://127.0.0.1:5173");
if (process.argv.includes("--check")) stopAll();
