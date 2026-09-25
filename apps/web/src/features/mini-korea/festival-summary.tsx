// 고른 행사의 미리보기 수치와 상담 입력으로 이어지는 문장을 보여 준다.
import type { FestivalSummary } from "@crowdcast/contracts/types";
import { Link } from "react-router-dom";
import { GradeMark } from "../../components/scene/grade-mark";
import { formatDate } from "../../lib/format";

// 상담이 받은 문장을 입력창에만 채우도록 날짜·지역·이름을 짧게 만든다.
export function consultationText(festival: FestivalSummary): string {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date(festival.startsAt));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("month")}월 ${value("day")}일 ${festival.sigunguName} ${festival.name}`;
}

// 일괄 예보는 발행 예보서가 아니므로 구간과 임시 사용 조건만 미리 보여 준다.
export function FestivalSummaryPanel({
  festival,
  status = "ready",
}: {
  festival: FestivalSummary | null;
  status?: "loading" | "ready" | "unavailable" | "error";
}) {
  if (!festival)
    return (
      <p
        className="festival-summary__empty"
        role={status === "error" ? "alert" : "status"}
      >
        {status === "loading"
          ? "행사 예보를 불러오는 중이에요."
          : status === "error"
            ? "예보 형식을 확인해 주세요."
            : status === "unavailable"
              ? "예보 연결을 확인해 주세요."
              : "행사를 고르면 예보 요약이 여기에 나와요."}
      </p>
    );
  return (
    <section className="festival-summary" aria-label="선택 행사 요약">
      <h3>{festival.name}</h3>
      <p>
        {formatDate(festival.startsAt)} · {festival.sigunguName}
      </p>
      <GradeMark level={festival.level} />
      <p>
        순간 최대 {festival.peakP10.toLocaleString("ko-KR")}~
        {festival.peakP90.toLocaleString("ko-KR")}명 추정 · 표본 한계로 구간
        기준 표시
      </p>
      {festival.ood && <p>참고용 — 담당자 검토 필수</p>}
      <Link
        to={`/consult?text=${encodeURIComponent(consultationText(festival))}`}
      >
        예보 상담에서 자세히 보기
      </Link>
    </section>
  );
}
