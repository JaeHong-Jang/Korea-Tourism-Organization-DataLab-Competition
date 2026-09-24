// 조건부 클래스 이름을 충돌 없이 합친다.
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// shadcn 부품과 앱 컴포넌트가 같은 클래스 결합 규칙을 쓴다.
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
