// 시군구 경계(admdongkor 행정동 → 시군구 병합 TopoJSON)를 받아 data/external/boundaries/에 둔다
// 버전은 방문자 API(15101972)의 2025년 시군구 코드 체계와 252개가 정확히 맞는 ver20251231로 고정한다(2026 개편 전)
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "data", "external", "boundaries");
const VERSION = "ver20251231";
const SOURCE = `https://raw.githubusercontent.com/vuski/admdongkor/master/${VERSION}/HangJeongDong_${VERSION}.geojson`;
const RAW = join(OUT_DIR, `HangJeongDong_${VERSION}.geojson`);
const TOPO = join(OUT_DIR, "sigungu.topo.json");

// 파일이 없을 때만 원본 행정동 경계를 받는다
async function download() {
  if (existsSync(RAW)) return console.log(`· 이미 있음: ${RAW}`);
  console.log(`▶ 받는 중: ${SOURCE}`);
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`다운로드 실패 ${res.status}`);
  writeFileSync(RAW, Buffer.from(await res.arrayBuffer()));
  console.log(`✓ ${(statSync(RAW).size / 1e6).toFixed(1)} MB`);
}

// 행정동을 시군구 코드(sgg)로 합치고 단순화해 TopoJSON으로 저장한다
function dissolve() {
  if (existsSync(TOPO)) return console.log(`· 이미 있음: ${TOPO}`);
  const r = spawnSync("npx", ["-y", "mapshaper@0.6", RAW,
    "-dissolve", "sgg", "copy-fields=sidonm,sggnm",
    "-each", "name = sggnm.replace(/^(.+?시)(.+구)$/, '$1 $2')",
    "-simplify", "6%", "keep-shapes",
    "-o", "format=topojson", "quantization=100000", TOPO], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("mapshaper 병합 실패");
  console.log(`✓ ${TOPO} (${(statSync(TOPO).size / 1e6).toFixed(2)} MB)`);
}

// 출처 표기를 옆에 남긴다(CC BY 4.0 + 공공누리 제1유형)
function attribution() {
  writeFileSync(join(OUT_DIR, "ATTRIBUTION.txt"),
    "본 데이터는 통계청 통계지리정보서비스(SGIS, https://sgis.kostat.go.kr)에서 공공누리 제1유형으로 개방한 행정동 경계를 가공한 것이며" +
    `(가공: vuski/admdongkor ${VERSION}, https://github.com/vuski/admdongkor), CC BY 4.0으로 배포됩니다. 시군구 병합·단순화: 인파예보.\n`);
}

mkdirSync(OUT_DIR, { recursive: true });
await download();
dissolve();
attribution();
