// 공개 Terrarium 타일을 한국 투영의 500m 고도 격자로 가공하며 인증 키는 사용하지 않는다.
import { mkdir, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { geoTransverseMercator } from 'd3-geo';
import { chromium } from '@playwright/test';

const root = new URL('../../apps/web/public/terrain/', import.meta.url);
const projection = geoTransverseMercator().rotate([-127.5, 0]).center([0, 36]).scale(6371.0088).translate([0, 0]);
const meta = { minX: -350, minZ: -450, step: 0.5, width: 1601, height: 1701, zoom: 8, source: 'Mapzen Terrain Tiles / USGS SRTM, GMTED2010 / NOAA ETOPO1', accessed: new Date().toISOString().slice(0, 10) };
const tiles = new Map();
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  // 전 영역을 덮는 원본 타일만 받아 각 픽셀을 미터 단위로 복호화한다.
  for (let x = 216; x <= 222; x++) for (let y = 97; y <= 104; y++) {
    const response = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/8/${x}/${y}.png`);
    if (!response.ok) throw new Error(`고도 타일 ${x}/${y}: ${response.status}`);
    const png = Buffer.from(await response.arrayBuffer()).toString('base64');
    const heights = await page.evaluate(async (encoded) => {
      const img = new Image(); img.src = `data:image/png;base64,${encoded}`; await img.decode();
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
      const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, 256, 256);
      return Array.from({ length: 65536 }, (_, i) => Math.max(0, Math.round(data[i * 4] * 256 + data[i * 4 + 1] + data[i * 4 + 2] / 256 - 32768)));
    }, png);
    tiles.set(`${x}/${y}`, heights);
  }
  const output = Buffer.alloc(meta.width * meta.height * 2);
  // 타일 경계 양쪽의 표본을 함께 보간해 조각 사이 높이 단차를 없앤다.
  const pixel = (x, y) => tiles.get(`${Math.floor(x / 256)}/${Math.floor(y / 256)}`)?.[(y % 256) * 256 + x % 256] ?? 0;
  for (let z = 0; z < meta.height; z++) for (let x = 0; x < meta.width; x++) {
    const [lng, lat] = projection.invert([meta.minX + x * meta.step, meta.minZ + z * meta.step]);
    const px = (lng + 180) / 360 * 65536 - 0.5;
    const py = (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * 65536 - 0.5;
    const ix = Math.floor(px), iy = Math.floor(py), tx = px - ix, ty = py - iy;
    const height = (pixel(ix, iy) * (1 - tx) + pixel(ix + 1, iy) * tx) * (1 - ty) + (pixel(ix, iy + 1) * (1 - tx) + pixel(ix + 1, iy + 1) * tx) * ty;
    output.writeUInt16LE(Math.round(height), (z * meta.width + x) * 2);
  }
  await mkdir(root, { recursive: true });
  await writeFile(new URL('korea-height.bin.gz', root), gzipSync(output));
  await writeFile(new URL('korea-height.json', root), JSON.stringify(meta, null, 2));
  console.log({ tiles: tiles.size, samples: meta.width * meta.height, compressedBytes: gzipSync(output).length });
} finally { await browser.close(); }
