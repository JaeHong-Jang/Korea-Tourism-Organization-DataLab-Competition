// 데이터가 연결되기 전 기능의 위치와 역할을 알려 주는 빈 패널이다.
import type { ReactNode } from "react";

type FeaturePanelProps = {
  id: string;
  title: string;
  description: string;
  className?: string;
  children?: ReactNode;
};

// 제목과 설명을 항상 함께 보여 주어 빈 영역도 찾을 수 있게 한다.
export function FeaturePanel({
  id,
  title,
  description,
  className = "",
  children,
}: FeaturePanelProps) {
  return (
    <section
      className={`feature-panel ${className}`}
      aria-labelledby={`${id}-title`}
    >
      <div className="feature-panel__heading">
        <span className="feature-panel__id">{id}</span>
        <h2 id={`${id}-title`}>{title}</h2>
      </div>
      <p>{description}</p>
      {children ?? <div className="feature-panel__empty" aria-hidden="true" />}
    </section>
  );
}
