// 넓은 삼각형을 분할한 뒤 실제 고도에 맞춰 표면과 법선을 만든다.
import { BufferGeometry, Float32BufferAttribute } from 'three';
import { terrainHeight, type ElevationGrid } from './elevation';
type Vertex = [number, number, number, number, number, number];

// 가장 긴 변만 분할해 길쭉한 도로에서 불필요한 삼각형 폭증을 피한다.
export function drapeGeometry(source: BufferGeometry, grid: ElevationGrid, step: number, local = false): BufferGeometry {
  const input = source.index ? source.toNonIndexed() : source;
  const position = input.getAttribute('position'), color = input.getAttribute('color');
  const output: number[] = [], colors: number[] = [];
  const vertex = (i: number): Vertex => [position.getX(i), position.getY(i), position.getZ(i), color.getX(i), color.getY(i), color.getZ(i)];
  const distance = (a: Vertex, b: Vertex) => Math.hypot(a[0] - b[0], a[local ? 1 : 2] - b[local ? 1 : 2]);
  const emit = (a: Vertex, b: Vertex, c: Vertex, level: number) => {
    const lengths = [distance(a, b), distance(b, c), distance(c, a)];
    const longest = Math.max(...lengths);
    if (longest > step && level < 16) {
      if (lengths[1] === longest) [a, b, c] = [b, c, a];
      else if (lengths[2] === longest) [a, b, c] = [c, a, b];
      const middle = a.map((v, i) => (v + b[i]) / 2) as Vertex;
      emit(a, middle, c, level + 1); emit(middle, b, c, level + 1);
      return;
    }
    for (const v of [a, b, c]) {
      const height = terrainHeight(grid, v[0], local ? -v[1] : v[2]);
      output.push(v[0], v[1] + (local ? 0 : height), v[2] + (local ? height : 0));
      colors.push(v[3], v[4], v[5]);
    }
  };
  for (let i = 0; i < position.count; i += 3) emit(vertex(i), vertex(i + 1), vertex(i + 2), 0);
  const result = new BufferGeometry();
  result.setAttribute('position', new Float32BufferAttribute(output, 3));
  result.setAttribute('color', new Float32BufferAttribute(colors, 3));
  result.computeVertexNormals();
  if (input !== source) input.dispose();
  source.dispose();
  return result;
}
