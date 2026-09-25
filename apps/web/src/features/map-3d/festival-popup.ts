// 지도 팝업에 행사 등급·추정 규모·로컬 대표 이미지를 안전한 DOM으로 표시한다.
import type { FestivalSummary } from "@crowdcast/contracts/types";

// 사용자 제공 HTML은 넣지 않고 계약 텍스트와 같은 출처의 이미지만 붙인다.
export function festivalPopup(festival: FestivalSummary): HTMLElement {
  const labels = ["✓ 소규모", "! 수립 권고", "▲ 수립 대상", "◆ 대규모"];
  const element = document.createElement("div");
  element.className = "map-2d__popup";
  const name = document.createElement("strong");
  name.textContent = festival.name;
  const level = document.createElement("span");
  level.textContent = `${festival.level}등급 · ${labels[festival.level - 1] ?? labels[3]}`;
  const estimate = document.createElement("span");
  estimate.textContent = `순간 최대 중앙값 ${festival.peakP50.toLocaleString("ko-KR")}명 · 추정 산식 기반`;
  element.append(name, level, estimate);
  if (festival.image) {
    const url = new URL(festival.image.url, window.location.origin);
    if (url.origin === window.location.origin) {
      const image = document.createElement("img");
      image.src = url.href;
      image.alt = `${festival.name} 대표 이미지`;
      const credit = document.createElement("small");
      credit.textContent = festival.image.credit;
      element.append(image, credit);
    }
  }
  return element;
}
