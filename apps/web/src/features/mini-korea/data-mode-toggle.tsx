// 현재 장면의 데이터 모드를 키보드와 포인터로 전환한다.

// 버튼의 눌림 상태를 읽기 도구에도 알리고 선택 변경은 상위 URL 상태에 맡긴다.
export function DataModeToggle({
  enabled,
  onChange,
  disabled = false,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      className="data-mode-toggle"
      type="button"
      aria-pressed={enabled}
      disabled={disabled}
      onClick={() => onChange(!enabled)}
    >
      데이터 모드 {enabled ? "켜짐" : "꺼짐"}
    </button>
  );
}
