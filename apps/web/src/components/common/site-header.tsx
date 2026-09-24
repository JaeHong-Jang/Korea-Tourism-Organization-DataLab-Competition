// 여섯 메뉴와 서울 해 상태, 사용자 테마 선택을 제공한다.
import { Menu, SunMoon } from "lucide-react";
import { NavLink } from "react-router-dom";
import type { ThemeChoice } from "../../lib/theme/sun-state";
import { useTheme } from "../../lib/theme/theme-provider";

const menus = [
  { label: "미니 대한민국", to: "/", end: true },
  { label: "예보 상담", to: "/consult", end: false },
  { label: "내 행사", to: "/my", end: false },
  { label: "검증", to: "/validation", end: false },
  { label: "인사이트", to: "/insights", end: false },
  { label: "운영", to: "/ops", end: false },
];

const skyLabels = { day: "낮", dusk: "노을", night: "밤" };

// 예보서와 계획 초안에서도 예보 상담 메뉴를 현재 위치로 표시한다.
function isConsultPath(pathname: string): boolean {
  return pathname === "/consult" || pathname.startsWith("/f/");
}

// 모바일에서도 모든 메뉴를 스크롤과 키보드로 열 수 있게 한다.
export function SiteHeader() {
  const { choice, setChoice, sky, at } = useTheme();
  const time = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(at);
  return (
    <header className="site-header">
      <div className="site-header__row">
        <NavLink to="/" className="brand" aria-label="인파예보 홈">
          <span className="brand__mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>인파예보</span>
        </NavLink>
        <nav className="main-nav" aria-label="주 메뉴">
          {menus.map((menu) => (
            <NavLink
              key={menu.to}
              to={menu.to}
              end={menu.end}
              className={({ isActive }) =>
                `main-nav__link${isActive || (menu.to === "/consult" && isConsultPath(window.location.pathname)) ? " is-active" : ""}`
              }
            >
              {menu.label}
            </NavLink>
          ))}
        </nav>
        <div className="site-header__tools">
          <span className="weather-chip">
            <SunMoon size={15} aria-hidden="true" /> 서울 · {skyLabels[sky]}{" "}
            {time}
          </span>
          <label className="theme-choice">
            <span className="sr-only">화면 테마</span>
            <select
              value={choice}
              onChange={(event) => setChoice(event.target.value as ThemeChoice)}
              aria-label="화면 테마"
            >
              <option value="auto">자동</option>
              <option value="day">낮</option>
              <option value="night">밤</option>
            </select>
          </label>
        </div>
      </div>
      <div className="mobile-menu-label">
        <Menu size={15} aria-hidden="true" /> 메뉴를 옆으로 넘겨 보세요
      </div>
    </header>
  );
}
