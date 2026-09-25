// 선택한 기준 노드의 설명과 원문, 연결 관계를 보여 준다.
import {
  type GraphData,
  type GraphNode,
  kindLabel,
  nodeRelations,
  sourceUrl,
} from "./graph-data";

// 연결 목록에서도 같은 상세 패널로 이동할 수 있다.
export function GraphDetail({
  data,
  selected,
  onSelect,
}: {
  data: GraphData;
  selected: GraphNode | null;
  onSelect: (id: string) => void;
}) {
  if (!selected)
    return (
      <aside className="knowledge-detail" aria-label="노드 상세">
        <p>노드를 고르면 설명과 연결 관계가 보여요.</p>
      </aside>
    );
  const url = sourceUrl(selected.url);
  const relations = nodeRelations(data, selected.id);
  return (
    <aside className="knowledge-detail" aria-label="노드 상세">
      <span className="knowledge-detail__kind">{kindLabel(selected.kind)}</span>
      <h2>{selected.label}</h2>
      <p>{selected.note || "등록된 설명이 없어요."}</p>
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer">
          원문 열기
        </a>
      )}
      <h3>연결된 노드</h3>
      {relations.length ? (
        <ul>
          {relations.map(({ edge, related, direction }) => (
            <li key={edge.id}>
              <span>
                {direction} · {edge.label}
              </span>
              <button type="button" onClick={() => onSelect(related.id)}>
                {kindLabel(related.kind)} · {related.label}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p>현재 표시된 종류에는 연결된 노드가 없어요.</p>
      )}
    </aside>
  );
}
