// 종류별 모양과 이름을 지닌 그래프 노드를 키보드 버튼으로 보여 준다.
import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { type GraphNode, kindLabel } from "./graph-data";

export type KnowledgeNodeData = {
  item: GraphNode;
  dimmed: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
};

// 종류는 색 외에 카드 테두리와 텍스트로도 구분한다.
export function KnowledgeNode({ data }: NodeProps<Node<KnowledgeNodeData>>) {
  const { item } = data;
  return (
    <div
      className={`knowledge-node knowledge-node--${item.kind}${data.dimmed ? " is-dimmed" : ""}${data.selected ? " is-selected" : ""}`}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <button
        type="button"
        onClick={() => data.onSelect(item.id)}
        aria-label={`${kindLabel(item.kind)}: ${item.label}`}
      >
        <span>{kindLabel(item.kind)}</span>
        <strong title={item.label}>{item.label}</strong>
      </button>
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
}
