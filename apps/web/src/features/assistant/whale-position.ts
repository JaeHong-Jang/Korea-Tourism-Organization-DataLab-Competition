// 고래 위치를 화면 안에 제한하고 저장된 좌표를 안전하게 읽는다.
export type WhalePoint = { x: number; y: number };
export type WhaleSize = { width: number; height: number };

export const WHALE_POSITION_KEY = "crowdcast:assistant:position";

// 화면 크기가 달라져도 고래 전체가 보이도록 왼쪽 위 좌표를 제한한다.
export function clampWhale(point: WhalePoint, size: WhaleSize): WhalePoint {
  return {
    x: Math.max(
      0,
      Math.min(point.x, Math.max(0, window.innerWidth - size.width)),
    ),
    y: Math.max(
      0,
      Math.min(point.y, Math.max(0, window.innerHeight - size.height)),
    ),
  };
}

// 포인터 시작점과 끝점의 차이만큼 옮기고 작은 움직임은 제자리에 둔다.
export function dragWhale(
  origin: WhalePoint,
  start: WhalePoint,
  end: WhalePoint,
  size: WhaleSize,
): WhalePoint {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  return Math.hypot(dx, dy) < 6
    ? origin
    : clampWhale({ x: origin.x + dx, y: origin.y + dy }, size);
}

// 키보드 화살표 한 번당 정해진 간격으로 움직인다.
export function nudgeWhale(
  origin: WhalePoint,
  key: string,
  size: WhaleSize,
): WhalePoint {
  const step = 16;
  const direction: Record<string, WhalePoint> = {
    ArrowLeft: { x: -step, y: 0 },
    ArrowRight: { x: step, y: 0 },
    ArrowUp: { x: 0, y: -step },
    ArrowDown: { x: 0, y: step },
  };
  const delta = direction[key];
  return delta
    ? clampWhale({ x: origin.x + delta.x, y: origin.y + delta.y }, size)
    : origin;
}

// 첫 방문에는 오른쪽 아래 여백에 놓고 저장 실패는 기본 위치로 넘긴다.
export function restoreWhale(size: WhaleSize): WhalePoint {
  const fallback = clampWhale(
    {
      x: window.innerWidth - size.width - 20,
      y: window.innerHeight - size.height - 20,
    },
    size,
  );
  try {
    const raw = window.localStorage.getItem(WHALE_POSITION_KEY);
    if (!raw) return fallback;
    const value: unknown = JSON.parse(raw);
    if (
      typeof value !== "object" ||
      value === null ||
      !("x" in value) ||
      !("y" in value)
    )
      return fallback;
    const { x, y } = value;
    if (
      typeof x !== "number" ||
      typeof y !== "number" ||
      !Number.isFinite(x) ||
      !Number.isFinite(y)
    )
      return fallback;
    return clampWhale({ x, y }, size);
  } catch {
    return fallback;
  }
}

// 저장이 거절된 브라우저에서도 현재 탭의 끌기는 계속 작동한다.
export function rememberWhale(point: WhalePoint): void {
  try {
    window.localStorage.setItem(WHALE_POSITION_KEY, JSON.stringify(point));
  } catch {
    // 브라우저 저장소가 막힌 경우에도 화면 위치는 유지한다.
  }
}
