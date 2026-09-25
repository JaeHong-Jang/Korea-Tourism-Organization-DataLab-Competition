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

// 여러 토큰을 한 번에 읽어 이름→값 사전으로 준다(테마가 바뀔 때만 다시 읽는다).
export function useCssVars(names: readonly string[]): Record<string, string> {
  const key = names.join("|");
  const read = () => {
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(
      key.split("|").map((name) => [name, style.getPropertyValue(name).trim()]),
    );
  };
  const [values, setValues] = useState(read);
  // biome-ignore lint/correctness/useExhaustiveDependencies: read는 key만 쓰는 매 렌더 함수다.
  useEffect(() => {
    const observer = new MutationObserver(() => setValues(read()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    setValues(read());
    return () => observer.disconnect();
  }, [key]);
  return values;
}
