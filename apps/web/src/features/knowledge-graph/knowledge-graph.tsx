// 전체 온톨로지와 기준 그래프를 필터·검색·상세·표로 탐색한다.
import type { KnowledgeGraph } from "@crowdcast/contracts/types";
import {
  Background,
  Controls,
  ReactFlow,
  type ReactFlowInstance,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildGraph,
  connectedNodes,
  filterGraph,
  type GraphKind,
  graphKinds,
  initialKinds,
  kindLabel,
  searchGraph,
} from "./graph-data";
import { GraphDetail } from "./graph-detail";
import { KnowledgeNode } from "./graph-node";
import { GraphTable } from "./graph-table";
import {
  flowEdges,
  flowNodes,
  type GraphPosition,
  layoutGraph,
  NODE_HEIGHT,
  NODE_WIDTH,
} from "./layout";

const nodeTypes = { knowledge: KnowledgeNode };
const layouts = new WeakMap<KnowledgeGraph, ReturnType<typeof layoutGraph>>();

// 계약 객체마다 한 번 배치하고 종류·검색 변경에는 좌표를 그대로 쓴다.
export function KnowledgeGraphView({ graph }: { graph: KnowledgeGraph }) {
  const data = useMemo(() => buildGraph(graph), [graph]);
  const [positions, setPositions] = useState<Map<string, GraphPosition> | null>(
    null,
  );
  const [layoutError, setLayoutError] = useState(false);
  const [kinds, setKinds] = useState<GraphKind[]>(initialKinds);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [table, setTable] = useState(false);
  const [flow, setFlow] = useState<ReactFlowInstance | null>(null);
  const filtered = useMemo(
    () => filterGraph(data, new Set(kinds)),
    [data, kinds],
  );
  const matches = useMemo(() => searchGraph(data, query), [data, query]);
  const selected = data.nodes.find((node) => node.id === selectedId) ?? null;
  const active = useMemo(
    () => (selectedId ? connectedNodes(filtered, selectedId) : null),
    [filtered, selectedId],
  );

  // 비동기 ELK 결과는 화면이 사라진 뒤 반영하지 않는다.
  useEffect(() => {
    let cancelled = false;
    const layout = layouts.get(graph) ?? layoutGraph(data);
    layouts.set(graph, layout);
    layout
      .then((value) => {
        if (!cancelled) setPositions(value);
      })
      .catch(() => {
        layouts.delete(graph);
        if (!cancelled) setLayoutError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [graph, data]);

  // 검색 결과나 상세 관계를 고르면 숨겨진 종류를 켜고 해당 좌표로 이동한다.
  const selectNode = useCallback(
    (id: string) => {
      const node = data.nodes.find((item) => item.id === id);
      if (!node) return;
      setKinds((current) =>
        current.includes(node.kind) ? current : [...current, node.kind],
      );
      setSelectedId(id);
      const position = positions?.get(id);
      if (flow && position && !table)
        void flow.setCenter(
          position.x + NODE_WIDTH / 2,
          position.y + NODE_HEIGHT / 2,
          {
            zoom: 0.9,
            duration: window.matchMedia("(prefers-reduced-motion: reduce)")
              .matches
              ? 0
              : 250,
          },
        );
    },
    [data, positions, flow, table],
  );

  // 선택 경로가 숨겨지면 상세를 닫아 보이지 않는 관계를 강조하지 않는다.
  const toggleKind = (kind: GraphKind) => {
    setKinds((current) =>
      current.includes(kind)
        ? current.filter((item) => item !== kind)
        : [...current, kind],
    );
    if (selected?.kind === kind) setSelectedId(null);
  };
  const nodes = useMemo(
    () =>
      positions
        ? flowNodes(filtered, positions, active, selectedId, selectNode)
        : [],
    [filtered, positions, active, selectedId, selectNode],
  );
  const edges = useMemo(() => flowEdges(filtered, active), [filtered, active]);
  const generatedAt = new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(graph.generatedAt));

  // 그래프를 그릴 수 없어도 동일한 필터 자료를 표로 열 수 있다.
  return (
    <section className="knowledge-graph" aria-label="전체 근거 그래프">
      <div className="knowledge-graph__toolbar">
        <p>
          기준 그래프 버전 {graph.masterVersion} · 생성 {generatedAt} · 노드{" "}
          {filtered.nodes.length}개 · 관계 {filtered.edges.length}개
        </p>
        <button type="button" onClick={() => setTable((value) => !value)}>
          {table ? "그래프로 보기" : "표로 보기"}
        </button>
      </div>
      <fieldset className="knowledge-graph__filters">
        <legend>노드 종류 필터</legend>
        {graphKinds.map(({ kind, label }) => (
          <button
            key={kind}
            type="button"
            aria-pressed={kinds.includes(kind)}
            onClick={() => toggleKind(kind)}
          >
            {label}
          </button>
        ))}
      </fieldset>
      <div className="knowledge-graph__search">
        <label htmlFor="knowledge-search">노드 검색</label>
        <input
          id="knowledge-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="이름 또는 설명 두 글자 이상"
        />
        {[...query.trim()].length > 0 && [...query.trim()].length < 2 && (
          <p>두 글자부터 검색해 주세요.</p>
        )}
        {[...query.trim()].length >= 2 && (
          <section className="knowledge-graph__results" aria-label="검색 결과">
            <p>
              {matches.length
                ? `검색 결과 ${matches.length}개`
                : "일치하는 노드가 없어요."}
            </p>
            {matches.length > 0 && (
              <ul>
                {matches.map((item) => (
                  <li key={item.id}>
                    <button type="button" onClick={() => selectNode(item.id)}>
                      {kindLabel(item.kind)} · {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
      <div className="knowledge-graph__body">
        {table ? (
          <GraphTable data={filtered} onSelect={selectNode} />
        ) : (
          <section
            className="knowledge-graph__canvas"
            aria-label="온톨로지와 기준 그래프"
          >
            {layoutError ? (
              <p role="alert">
                그래프를 배치할 수 없어요. 표로 보기를 이용해 주세요.
              </p>
            ) : !data.nodes.length ? (
              <p>표시할 기준 그래프가 없어요.</p>
            ) : !filtered.nodes.length ? (
              <p>선택한 종류에 노드가 없어요.</p>
            ) : !positions ? (
              <p role="status">그래프를 배치하고 있어요.</p>
            ) : (
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onInit={setFlow}
                nodesDraggable={false}
                nodesConnectable={false}
                nodesFocusable={false}
                edgesFocusable={false}
                elementsSelectable={false}
                onlyRenderVisibleElements
                fitView
                fitViewOptions={{ padding: 0.12, minZoom: 0.01, maxZoom: 1 }}
                minZoom={0.01}
                maxZoom={1.5}
              >
                <Background />
                <Controls showInteractive={false} />
              </ReactFlow>
            )}
          </section>
        )}
        <GraphDetail
          data={filtered}
          selected={selected}
          onSelect={selectNode}
        />
      </div>
    </section>
  );
}
