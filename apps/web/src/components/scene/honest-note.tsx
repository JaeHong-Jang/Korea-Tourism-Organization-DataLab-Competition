// 장면 속 인형 규모와 연출 움직임의 의미를 분명히 알린다.
export function HonestNote() {
  return (
    <span className="scene-legend__note">
      인원 규모는 예보값 비례 · 움직임은 연출 · 인형 위치는 실제 사람 위치가
      아니에요. 전국 판 땅 색·도로·호수 = 공개 지도(OpenStreetMap) 토지 피복,
      건물 하나하나·강 줄기(대략 경로)·차·기차·배·비행기 = 연출이며 실제
      위치·운행이 아니에요. 날씨 효과 = 기상청 예보 기반 연출.
    </span>
  );
}
