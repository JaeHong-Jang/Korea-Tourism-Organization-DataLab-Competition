// Three 재질처럼 CSS를 직접 못 쓰는 곳에서 테마가 바뀔 때마다 CSS 토큰 값을 다시 읽는다.
import { useEffect, useState } from "react";

// 문서의 data-theme 속성이 바뀐 뒤에 읽어야 새 테마 값이 나온다.
export function useCssVar(name: string): string {
  const read = () =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const [value, setValue] = useState(read);
  // biome-ignore lint/correctness/useExhaustiveDependencies: read는 name만 쓰는 매 렌더 함수다.
  useEffect(() => {
    const observer = new MutationObserver(() => setValue(read()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    setValue(read());
    return () => observer.disconnect();
  }, [name]);
  return value;
}
