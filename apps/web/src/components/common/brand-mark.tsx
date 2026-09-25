// 인파예보 로고: 고래 등 곡선과 위로 솟는 세 방울(모이는 사람)을 한 모양으로 그린다.

// 크기만 받고 색은 테마 토큰(--brand·--brand-soft)을 따른다.
export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <svg
      className="brand__mark"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="10.5" cy="9.6" r="2" className="brand__drop brand__drop--1" />
      <circle cx="15" cy="6.4" r="2.6" className="brand__drop brand__drop--2" />
      <circle
        cx="19.8"
        cy="8.8"
        r="2.2"
        className="brand__drop brand__drop--3"
      />
      <path
        className="brand__body"
        d="M3.5 21.2c0-4.9 4.6-8.3 10.4-8.3 4.3 0 7.2 1.7 9.3 3.6 1.2 1.1 2.4.9 3.3-.5.4-.6 1.4-.5 1.5.3.4 3.6-1.6 7.6-6.4 9.1-2.3.7-4.6.9-7.3.9H9.1c-3.4 0-5.6-2.1-5.6-5.1z"
      />
      <circle cx="10.2" cy="19.2" r="1.15" className="brand__eye" />
      <path
        className="brand__belly"
        d="M6.6 23.6c2.2 1.2 6.4 1.5 10.4.6"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
