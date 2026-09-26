// 개발 서버에서 코드가 바뀌어 화면에 반영되면 잠깐 "방금 반영됨"을 띄워 실시간 적용을 눈으로 확인하게 한다.
import { useEffect, useState } from "react";

// 배포 빌드에는 import.meta.hot이 없어 아무것도 그리지 않는다.
export function LiveUpdatePill() {
  const [at, setAt] = useState<string | null>(null);
  useEffect(() => {
    const hot = import.meta.hot;
    if (!hot) return;
    let timer = 0;
    const show = () => {
      setAt(
        new Intl.DateTimeFormat("ko-KR", {
          timeZone: "Asia/Seoul",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hourCycle: "h23",
        }).format(new Date()),
      );
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setAt(null), 5000);
    };
    hot.on("vite:afterUpdate", show);
    return () => {
      hot.off?.("vite:afterUpdate", show);
      window.clearTimeout(timer);
    };
  }, []);
  if (!at) return null;
  return (
    <p className="live-update-pill" role="status">
      방금 새 코드가 반영됐어요 · {at}
    </p>
  );
}
