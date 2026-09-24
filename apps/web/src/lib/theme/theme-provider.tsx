// 해 위치와 사용자 선택을 동기화해 문서 테마를 관리한다.
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  getDemoTheme,
  getDemoTime,
  getSkyState,
  getTheme,
  type SkyState,
  type ThemeChoice,
} from "./sun-state";

const STORAGE_KEY = "crowdcast-theme";
type ThemeContextValue = {
  choice: ThemeChoice;
  setChoice: (choice: ThemeChoice) => void;
  sky: SkyState;
  at: Date;
};
const ThemeContext = createContext<ThemeContextValue | null>(null);

// 저장소 접근이 막힌 브라우저에서도 자동 모드로 화면을 띄운다.
function readChoice(): ThemeChoice {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "day" || value === "night" ? value : "auto";
  } catch {
    return "auto";
  }
}

// 수동 테마를 기억하고 저장소 오류가 화면 조작을 막지 않게 한다.
function saveChoice(choice: ThemeChoice): void {
  try {
    localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // 저장소가 차단되어도 현재 탭의 선택은 유지한다.
  }
}

// 1분마다 해 상태를 새로 계산하고 데모 URL을 우선 적용한다.
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoice] = useState<ThemeChoice>(readChoice);
  const [now, setNow] = useState(() => new Date());
  const search = window.location.search;
  const at = getDemoTime(search) ?? now;
  const forcedTheme = getDemoTheme(search);
  const actualSky = getSkyState(at);
  const sky = forcedTheme ?? actualSky;
  const theme = forcedTheme ?? getTheme(choice, sky);

  // 사용자 선택이 바뀌는 즉시 다음 방문에 쓸 설정을 저장한다.
  useEffect(() => {
    saveChoice(choice);
  }, [choice]);

  // 화면과 CSS 토큰이 같은 해 상태를 바라보도록 문서 속성을 갱신한다.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.sky = sky;
  }, [theme, sky]);

  // 고정된 데모 시각은 유지하고 실제 시계만 주기적으로 갱신한다.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <ThemeContext.Provider value={{ choice, setChoice, sky, at }}>
      {children}
    </ThemeContext.Provider>
  );
}

// 헤더와 장면이 동일한 테마 상태를 공유한다.
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("ThemeProvider가 필요합니다.");
  return context;
}
