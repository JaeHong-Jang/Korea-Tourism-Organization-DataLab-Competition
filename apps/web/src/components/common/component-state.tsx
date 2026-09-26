// 도메인 부품의 로딩·빈 값·오류를 같은 접근성 문구로 보여 준다.
export type ComponentStatus = "ready" | "loading" | "error";

// 데이터가 없는 상태는 항목별 이름과 함께 읽히게 한다.
export function ComponentState({
  name,
  status,
}: {
  name: string;
  status: ComponentStatus | "empty";
}) {
  const message =
    status === "loading"
      ? `${name} 불러오는 중`
      : status === "error"
        ? `${name}을 불러오지 못했어요.`
        : `${name}이 없어요.`;
  return (
    <p className="kit-state" role={status === "error" ? "alert" : "status"}>
      {message}
    </p>
  );
}
