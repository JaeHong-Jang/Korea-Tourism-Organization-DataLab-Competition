// 미터 고도 격자를 지도와 같은 km 좌표에서 보간한다.
export type ElevationGrid = { minX: number; minZ: number; step: number; width: number; height: number; values: Uint16Array };
export const TERRAIN_EXAGGERATION = 1.6;

// 범위 밖과 바다는 평지로 유지하며 실제 고도는 화면에서만 1.6배 강조한다.
export function terrainHeight(grid: ElevationGrid | null | undefined, x: number, z: number): number {
  if (!grid) return 0;
  const gx = (x - grid.minX) / grid.step, gz = (z - grid.minZ) / grid.step;
  if (gx < 0 || gz < 0 || gx >= grid.width - 1 || gz >= grid.height - 1) return 0;
  const ix = Math.floor(gx), iz = Math.floor(gz), tx = gx - ix, tz = gz - iz;
  const i = iz * grid.width + ix, v = grid.values;
  return ((v[i] * (1 - tx) + v[i + 1] * tx) * (1 - tz) + (v[i + grid.width] * (1 - tx) + v[i + grid.width + 1] * tx) * tz) / 1000 * TERRAIN_EXAGGERATION;
}

let pending: Promise<ElevationGrid> | undefined;
// 압축 격자는 페이지 수명 동안 한 번만 읽고 실패하면 다음 진입에서 재시도한다.
export function loadElevation(): Promise<ElevationGrid> {
  pending ??= Promise.all([fetch('/terrain/korea-height.json'), fetch('/terrain/korea-height.bin.gz')]).then(async ([meta, binary]) => {
    if (!meta.ok || !binary.ok || !binary.body) throw new Error('고도 자료를 불러오지 못했습니다.');
    const header = await meta.json();
    // 서버가 Content-Encoding으로 이미 푼 응답과 원본 gzip 응답을 모두 지원한다.
    const bytes = new Uint8Array(await binary.arrayBuffer());
    const data = bytes[0] === 0x1f && bytes[1] === 0x8b
      ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
      : bytes.buffer;
    if (data.byteLength !== header.width * header.height * 2) throw new Error('고도 자료 크기가 일치하지 않습니다.');
    return { ...header, values: new Uint16Array(data) };
  }).catch((error) => { pending = undefined; throw error; });
  return pending;
}
