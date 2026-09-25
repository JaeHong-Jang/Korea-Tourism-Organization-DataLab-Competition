// 그래프의 관계와 연결되지 않은 노드를 표로 읽는다.
import { type GraphData, kindLabel, sourceUrl } from "./graph-data";

// 표의 노드 버튼은 그래프와 같은 상세 패널을 연다.
export function GraphTable({
  data,
  onSelect,
}: {
  data: GraphData;
  onSelect: (id: string) => void;
}) {
  const nodes = new Map(data.nodes.map((node) => [node.id, node]));
  const linked = new Set(
    data.edges.flatMap((edge) => [edge.source, edge.target]),
  );
  return (
    <div className="knowledge-table-wrap">
      <table className="knowledge-table">
        <caption>기준 그래프의 노드와 연결 관계</caption>
        <thead>
          <tr>
            <th scope="col">출발 노드</th>
            <th scope="col">관계</th>
            <th scope="col">도착 노드</th>
            <th scope="col">원문</th>
          </tr>
        </thead>
        <tbody>
          {data.edges.map((edge) => {
            const source = nodes.get(edge.source);
            const target = nodes.get(edge.target);
            const url = sourceUrl(source?.url) ?? sourceUrl(target?.url);
            return (
              <tr key={edge.id}>
                <td>
                  {source && (
                    <button type="button" onClick={() => onSelect(source.id)}>
                      {kindLabel(source.kind)} · {source.label}
                    </button>
                  )}
                </td>
                <td>{edge.label}</td>
                <td>
                  {target && (
                    <button type="button" onClick={() => onSelect(target.id)}>
                      {kindLabel(target.kind)} · {target.label}
                    </button>
                  )}
                </td>
                <td>
                  {url ? (
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      원문 열기
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            );
          })}
          {data.nodes
            .filter((node) => !linked.has(node.id))
            .map((node) => (
              <tr key={node.id}>
                <td>
                  <button type="button" onClick={() => onSelect(node.id)}>
                    {kindLabel(node.kind)} · {node.label}
                  </button>
                </td>
                <td>연결 없음</td>
                <td>—</td>
                <td>
                  {sourceUrl(node.url) ? (
                    <a
                      href={sourceUrl(node.url) ?? ""}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      원문 열기
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
