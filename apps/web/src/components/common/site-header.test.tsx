// 예보서와 계획 초안에서 현재 메뉴가 내 행사로 표시되는지 확인한다.
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { expect, it } from "vitest";
import { ThemeProvider } from "../../lib/theme/theme-provider";
import { SiteHeader } from "./site-header";

// 실제 라우터 안의 헤더를 렌더링해 메뉴 표시와 접근성 상태를 함께 확인한다.
function headerAt(path: string): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <ThemeProvider>
        <SiteHeader />
      </ThemeProvider>
    </MemoryRouter>,
  );
}

// 발행 문서와 계획 초안의 상위 메뉴를 내 행사로 유지한다.
it.each(["/f/f-busan-first", "/f/f-busan-first/plan"])(
  "%s에서 내 행사 메뉴를 현재 위치로 표시한다",
  (path) => {
    const header = headerAt(path);
    expect(header).toMatch(
      /aria-current="page"[^>]*class="main-nav__link is-active"[^>]*>내 행사<\/a>/,
    );
    expect(header).not.toMatch(
      /class="main-nav__link is-active"[^>]*>예보 상담<\/a>/,
    );
  },
);

// 새 예보를 만드는 상담 화면에서는 상담 메뉴가 현재 위치다.
it("상담 화면은 예보 상담 메뉴를 표시한다", () => {
  const header = headerAt("/consult");
  expect(header).toMatch(
    /class="main-nav__link is-active"[^>]*>예보 상담<\/a>/,
  );
  expect(header).not.toMatch(
    /class="main-nav__link is-active"[^>]*>내 행사<\/a>/,
  );
});
