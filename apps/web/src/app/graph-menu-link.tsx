// 허용된 앱 셸에서 기존 주 메뉴의 검증 바로 뒤에 근거 그래프 링크를 단다.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink } from "react-router-dom";

// 헤더의 메뉴 구조를 유지하면서 그래프 경로를 독립적으로 추가한다.
export function GraphMenuLink() {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const validation = document.querySelector(
      '.main-nav__link[href="/validation"]',
    );
    if (!validation?.parentElement) return;
    const node = document.createElement("span");
    node.className = "graph-menu-slot";
    validation.after(node);
    setSlot(node);
    return () => {
      setSlot(null);
      node.remove();
    };
  }, []);
  return (
    slot &&
    createPortal(
      <NavLink
        to="/graph"
        className={({ isActive }) =>
          `main-nav__link${isActive ? " is-active" : ""}`
        }
      >
        근거 그래프
      </NavLink>,
      slot,
    )
  );
}
