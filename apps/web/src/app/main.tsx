// 인파예보 앱을 브라우저에 연결한다.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "../lib/theme/theme-provider";
import { App } from "./app";
import "../styles/app.css";

const root = document.getElementById("root");
if (!root) throw new Error("앱 시작 지점을 찾을 수 없습니다.");

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
);
