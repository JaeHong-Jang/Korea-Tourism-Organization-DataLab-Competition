// 메뉴 이름과 같은 화면 제목 및 짧은 안내를 보여 준다.
import { useLocation } from "react-router-dom";

export function PageHeading({
  title,
  description,
  eyebrow,
}: {
  title: string;
  description: string;
  eyebrow: string;
}) {
  const debug = new URLSearchParams(useLocation().search).get("debug") === "1";
  const cleanEyebrow = eyebrow.startsWith("S3 ·")
    ? "발행된 예보"
    : eyebrow.replace(/^S[1-8]\s*·\s*/, "").replace(/\s*·?\s*DEMO\b/gi, "");
  return (
    <div className="page-heading">
      <span className="eyebrow" data-feature={eyebrow.match(/^S[1-8]/)?.[0]}>
        {debug ? eyebrow : cleanEyebrow}
      </span>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  );
}
