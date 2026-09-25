// 앱 서비스 5개를 한 번에 띄우고 health를 기다린 뒤 주소를 알려 준다(Ollama 상태는 따로 표시만 한다)
import { parseEnv } from "node:util";
import { spawn, execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HEALTH_TIMEOUT_MS = 60_000;

// 포트는 한곳에서 정한다: .env의 *_PORT(없으면 기본값) → 실행 명령·health 주소·게이트웨이의 하위 서비스 주소
const PORT_DEFAULTS = { FORECAST_PORT: 8010, KNOWLEDGE_PORT: 8020, RECORDS_PORT: 8030, GATEWAY_PORT: 8787, WEB_PORT: 5173 };

// 서비스 목록: 각 레인의 골격 task가 이 시작 명령과 health 주소를 만족해야 한다
function servicesFor(env) {
  const port = (k) => String(env[k] || PORT_DEFAULTS[k]);
  const url = (k) => `http://127.0.0.1:${port(k)}`;
  return [
    { name: "forecast", color: 34, marker: "services/forecast/src/crowdcast/api/app.py",
      cmd: "uv", args: ["run", "--package", "crowdcast-forecast", "uvicorn", "crowdcast.api.app:app", "--port", port("FORECAST_PORT")],
      health: `${url("FORECAST_PORT")}/health` },
    { name: "knowledge", color: 36, marker: "services/knowledge/src/knowledge/api/app.py",
      cmd: "uv", args: ["run", "--package", "crowdcast-knowledge", "uvicorn", "knowledge.api.app:app", "--port", port("KNOWLEDGE_PORT")],
      health: `${url("KNOWLEDGE_PORT")}/health` },
    { name: "records", color: 35, marker: "services/records/public/index.php",
      cmd: "php", args: ["-S", `127.0.0.1:${port("RECORDS_PORT")}`, "-t", "services/records/public"],
      health: `${url("RECORDS_PORT")}/health` },
    { name: "gateway", color: 33, marker: "services/gateway/package.json",
      cmd: "npm", args: ["-w", "services/gateway", "run", "dev"],
      health: `${url("GATEWAY_PORT")}/api/health` },
    { name: "web", color: 32, marker: "apps/web/package.json",
      cmd: "npm", args: ["-w", "apps/web", "run", "dev", "--", "--port", port("WEB_PORT"), "--strictPort"],
      health: `${url("WEB_PORT")}/` },
  ];
}

// 게이트웨이가 하위 서비스를 같은 포트로 찾도록 주소를 넘긴다(이미 있으면 그대로)
function linkServiceUrls(env) {
  for (const [name, key] of [["FORECAST_URL", "FORECAST_PORT"], ["KNOWLEDGE_URL", "KNOWLEDGE_PORT"], ["RECORDS_URL", "RECORDS_PORT"]]) {
    env[name] ??= `http://127.0.0.1:${env[key] || PORT_DEFAULTS[key]}`;
  }
  env.GATEWAY_PORT ??= String(PORT_DEFAULTS.GATEWAY_PORT);
}

// .env를 읽어 환경변수로 넘긴다(이미 있는 값은 덮어쓰지 않는다)
function loadEnv() {
  const path = join(ROOT, ".env");
  const env = { ...process.env };
  if (!existsSync(path)) return env;
  // 게이트웨이와 같은 Node 표준 파서(node:util parseEnv)로 따옴표·줄 끝 주석을 처리한다
  for (const [key, value] of Object.entries(parseEnv(readFileSync(path, "utf8")))) env[key] ??= value;
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

// 공유 링크 토큰(sh-…)은 접근 로그에 그대로 남지 않게 가린다(PHP 개발 서버가 요청 URL을 찍는다)
const maskSecrets = (line) => line.replace(/(?<![A-Za-z0-9_-])sh-[A-Za-z0-9_-]{16,64}/g, "sh-***");

// 종료 직전에 개행 없이 남은 로그 조각을 내보낼 함수들
const flushers = [];

// 서비스 하나를 띄우고 로그 앞에 이름을 붙인다
function start(svc, env) {
  const child = spawn(svc.cmd, svc.args, { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
  const tag = `\x1b[${svc.color}m[${svc.name}]\x1b[0m `;
  // 청크 경계에서 토큰이 둘로 나뉘지 않게 완전한 줄을 모은 뒤 가린다
  const pipe = (stream) => {
    let rest = "";
    const write = (line) => { if (line.trim()) process.stdout.write(tag + maskSecrets(line) + "\n"); };
    stream.on("data", (buf) => {
      const lines = (rest + buf.toString()).split("\n");
      rest = lines.pop() ?? "";
      for (const line of lines) write(line);
    });
    const flush = () => { write(rest); rest = ""; };
    stream.on("end", flush);
    flushers.push(flush);
  };
  pipe(child.stdout);
  pipe(child.stderr);
  child.on("exit", (code) => process.stdout.write(`${tag}종료(code ${code})\n`));
  return child;
}

// 실행: 있는 서비스만 띄우고, 없는 서비스는 "아직 없음"으로 알린다
const env = loadEnv();
linkServiceUrls(env);
const SERVICES = servicesFor(env);
const hosts = ollamaCandidates(env);
let ollama = null;
for (const h of hosts) if (await probe(`${h}/api/version`)) { ollama = h; break; }
if (ollama) env.OLLAMA_HOST = ollama;
// 빈 프롬프트로 모델만 미리 올린다 — 첫 대화가 로딩 시간 때문에 규칙 문장으로 떨어지지 않게(기다리지 않음)
if (ollama)
  fetch(`${ollama}/api/generate`, {
    method: "POST",
    body: JSON.stringify({ model: env.OLLAMA_MODEL_FAST || "qwen3:4b-instruct-2507-q4_K_M", prompt: "", keep_alive: "30m" }),
  }).catch(() => {});

// --only forecast,knowledge: 그 서비스만 띄운다(병렬 워커가 같은 포트를 두고 부딪히지 않게)
const onlyAt = process.argv.indexOf("--only");
const only = onlyAt > 0 ? new Set(process.argv[onlyAt + 1].split(",")) : null;
const children = [];
const present = SERVICES.filter((s) => existsSync(join(ROOT, s.marker)) && (!only || only.has(s.name)));
for (const s of SERVICES.filter((x) => !present.includes(x) && (!only || only.has(x.name)))) console.log(`· ${s.name}: 아직 없음(${s.marker})`);
for (const s of present) children.push(start(s, env));

// Ctrl+C로 전부 함께 끈다
// 남은 로그를 내보내고 stdout 쓰기가 끝난 뒤에 종료한다(파이프로 이어진 stdout은 비동기라 바로 exit하면 잘린다)
const stopAll = (code = 0) => {
  for (const flush of flushers) flush();
  for (const c of children) c.kill("SIGTERM");
  process.stdout.write("", () => process.exit(code));
};
process.on("SIGINT", () => stopAll());
process.on("SIGTERM", () => stopAll());

// health 결과와 주소를 출력한다
const results = await Promise.all(present.map(async (s) => [s, await waitHealthy(s.health)]));
console.log("\n── 인파예보 로컬 실행 ──");
for (const [s, ok] of results) console.log(`${ok ? "✓" : "✗"} ${s.name.padEnd(9)} ${s.health}`);
console.log(`${ollama ? "✓" : "·"} ollama    ${ollama ?? "연결 안 됨 — 템플릿 모드로 동작"} (${hosts.join(", ")})`);
if (present.some((s) => s.name === "web")) console.log("\n열기: http://127.0.0.1:5173");
// --check: 확인만 하고 끈다. 고른 서비스 중 하나라도 실패하면 종료 코드 1(게이트에서 쓴다)
if (process.argv.includes("--check")) stopAll(results.every(([, ok]) => ok) ? 0 : 1);
