// 전체 온톨로지와 기준 그래프를 3D·필터·검색·상세·표로 탐색한다.
import type { KnowledgeGraph } from "@crowdcast/contracts/types";
import { useCallback, useMemo, useState } from "react";
import { hasWebGl2 } from "../../components/scene/scene-options";
import {
  buildGraph,
  connectedNodes,
  filterGraph,
  type GraphKind,
  graphKinds,
  kindLabel,
  searchGraph,
} from "./graph-data";
import { GraphDetail } from "./graph-detail";
import { GraphScene3d } from "./graph-scene-3d";
import { kindStyle } from "./graph-style";
import { GraphTable } from "./graph-table";
import { layoutGraph3d, nodeDegrees } from "./layout-3d";

const layouts = new WeakMap<KnowledgeGraph, ReturnType<typeof layoutGraph3d>>();

// 계약 객체마다 한 번 배치하고 종류·검색 변경에는 좌표를 그대로 쓴다.
export function KnowledgeGraphView({ graph }: { graph: KnowledgeGraph }) {
  const data = useMemo(() => buildGraph(graph), [graph]);
  const positions = useMemo(() => {
    const cached = layouts.get(graph) ?? layoutGraph3d(data);
    layouts.set(graph, cached);
    return cached;
  }, [graph, data]);
  const degrees = useMemo(() => nodeDegrees(data), [data]);
  const [webgl] = useState(hasWebGl2);
  const [reducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [kinds, setKinds] = useState<GraphKind[]>(() =>
    graphKinds.map(({ kind }) => kind),
  );
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [table, setTable] = useState(!webgl);
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

  // 검색 결과나 상세 관계를 고르면 숨겨진 종류를 켜고 선택한다(카메라는 3D 장면이 옮긴다).
  const selectNode = useCallback(
    (id: string) => {
      const node = data.nodes.find((item) => item.id === id);
      if (!node) return;
      setKinds((current) =>
        current.includes(node.kind) ? current : [...current, node.kind],
      );
      setSelectedId(id);
    },
    [data],
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
      <div className="knowledge-graph__body">
        {table ? (
          <GraphTable data={filtered} onSelect={selectNode} />
        ) : (
          <section
            className="knowledge-graph__canvas"
            aria-label="온톨로지와 기준 그래프"
          >
            {!data.nodes.length ? (
              <p>표시할 기준 그래프가 없어요.</p>
            ) : !filtered.nodes.length ? (
              <p>선택한 종류에 노드가 없어요.</p>
            ) : (
              <>
                <GraphScene3d
                  data={filtered}
                  positions={positions}
                  degrees={degrees}
                  selectedId={selectedId}
                  active={active}
                  onSelect={selectNode}
                  onClear={() => setSelectedId(null)}
                  reducedMotion={reducedMotion}
                />
                <p className="knowledge-graph__hint">
                  왼쪽 끌기 이동 · 휠 버튼 끌기 회전 · 휠 확대 · 노드를 누르면
                  이어진 것만 밝아져요
                </p>
              </>
            )}
          </section>
        )}
        <div className="knowledge-graph__side">
          <fieldset className="knowledge-graph__filters">
            <legend>노드 종류 필터</legend>
            {graphKinds.map(({ kind, label }) => (
              <button
                key={kind}
                type="button"
                aria-pressed={kinds.includes(kind)}
                onClick={() => toggleKind(kind)}
              >
                <i
                  className={`knowledge-graph__swatch knowledge-graph__swatch--${kindStyle[kind].shape}`}
                  style={{ background: `var(${kindStyle[kind].color})` }}
                  aria-hidden="true"
                />
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
              <section
                className="knowledge-graph__results"
                aria-label="검색 결과"
              >
                <p>
                  {matches.length
                    ? `검색 결과 ${matches.length}개`
                    : "일치하는 노드가 없어요."}
                </p>
                {matches.length > 0 && (
                  <ul>
                    {matches.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => selectNode(item.id)}
                        >
                          {kindLabel(item.kind)} · {item.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </div>
          <GraphDetail
            data={filtered}
            selected={selected}
            onSelect={selectNode}
          />
        </div>
      </div>
    </section>
  );
}
