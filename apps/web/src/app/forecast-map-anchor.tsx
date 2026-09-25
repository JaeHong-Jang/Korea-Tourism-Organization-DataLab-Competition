// 대화 카드의 근거 정리 링크가 예보서의 근거 탭을 바로 열게 한다.
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

// 예보서가 비동기로 도착하면 해시가 가리키는 탭을 한 번 선택한다.
export function ForecastMapAnchor() {
  const location = useLocation();
  useEffect(() => {
    if (
      location.hash !== "#forecast-tab-map" ||
      !location.pathname.startsWith("/f/")
    )
      return;
    const main = document.getElementById("main-content");
    if (!main) return;
    const open = () => {
      const tab = document.getElementById("forecast-tab-map");
      if (!tab) return false;
      tab.click();
      return true;
    };
    if (open()) return;
    const changes = new MutationObserver(() => {
      if (open()) changes.disconnect();
    });
    changes.observe(main, { childList: true, subtree: true });
    return () => changes.disconnect();
  }, [location.hash, location.pathname]);
  return null;
}
