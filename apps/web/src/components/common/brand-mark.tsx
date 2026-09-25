// 인파예보 로고: 사용자가 봇에 쓰라고 준 고래 그림을 그대로 쓴다.

// 크기만 받고 그림 비율(70×61)은 유지한다.
export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <img
      className="brand__mark"
      src="/assistant/whale.png"
      width={Math.round((size * 70) / 61)}
      height={size}
      alt=""
      aria-hidden="true"
    />
  );
}
