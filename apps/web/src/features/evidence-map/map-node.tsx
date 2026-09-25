// 그래프 노드를 키보드 버튼과 종류별 형태로 보여 준다.
import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { BookOpen, Database, FileText, Link2 } from "lucide-react";
import { evidenceKinds } from "../../components/common/evidence-chip";
import type { MapNode } from "./graph-data";

export type MapNodeData = {
  item: MapNode;
  number?: number;
  dimmed: boolean;
  selected: boolean;
  onActivate: (item: MapNode, origin: HTMLElement) => void;
  onFocusPath: (id: string | null) => void;
};

// 근거 종류의 아이콘과 카드 번호를 기존 서랍의 번호표로 맞춘다.
export function EvidenceMapNode({ id, data }: NodeProps<Node<MapNodeData>>) {
  const { item } = data;
  const Icon =
    item.kind === "evidence" && item.evidenceKind
      ? evidenceKinds[item.evidenceKind].Icon
      : item.kind === "claim"
        ? FileText
        : item.kind === "source"
          ? Link2
          : item.id.startsWith("document:dataset:")
            ? Database
            : BookOpen;
  const category =
    item.kind === "evidence" && item.evidenceKind
      ? evidenceKinds[item.evidenceKind].label
      : item.kind === "claim"
        ? "발행 문장"
        : item.kind === "source"
          ? "출처"
          : "데이터셋·문서";
  const number = data.number ? ` [${data.number}]` : "";
  return (
    <div
      className={`evidence-map-node evidence-map-node--${item.kind}${item.evidenceKind ? ` evidence-map-node--${item.evidenceKind}` : ""}${data.dimmed ? " is-dimmed" : ""}${data.selected ? " is-selected" : ""}`}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <button
        type="button"
        className="evidence-map-node__button"
        aria-label={`${category}${number}: ${item.label}`}
        aria-description={
          item.kind === "document" && item.url
            ? "원문을 새 탭에서 열어요."
            : undefined
        }
        onClick={(event) => data.onActivate(item, event.currentTarget)}
        onFocus={() => data.onFocusPath(id)}
        onBlur={() => data.onFocusPath(null)}
        onMouseEnter={() => data.onFocusPath(id)}
        onMouseLeave={() => data.onFocusPath(null)}
      >
        <span className="evidence-map-node__kind">
          <Icon size={15} aria-hidden="true" />
          {category}
          {number}
        </span>
        <strong title={item.label}>{item.label}</strong>
        {item.detail && <small title={item.detail}>{item.detail}</small>}
      </button>
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
}
