// 발행 예보서의 근거 경로를 그래프와 표로 탐색한다.
import type { Evidence, ForecastReport } from "@crowdcast/contracts/types";
import {
  Background,
  Controls,
  ReactFlow,
  type ReactFlowInstance,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { evidenceKinds } from "../../components/common/evidence-chip";
import { evidenceNumber } from "../../components/common/evidence-number";
import type { OpenEvidence } from "../forecast-report/report-claims";
import { EvidenceMapTable, mapEvidenceKinds } from "./evidence-map-table";
import { focusEvidenceKind } from "./filter-keyboard";
import {
  buildEvidenceMap,
  connectedPath,
  filterEvidenceMap,
  type MapNode,
} from "./graph-data";
import { flowEdges, flowPositions, layoutEvidenceMap } from "./layout";
import { EvidenceMapNode, type MapNodeData } from "./map-node";

const nodeTypes = { evidenceMap: EvidenceMapNode };
// 같은 발행 객체를 다시 열거나 StrictMode가 효과를 반복해도 배치를 공유한다.
const snapshotLayouts = new WeakMap<
  ForecastReport,
  ReturnType<typeof layoutEvidenceMap>
>();

// 선택·필터는 배치 결과만 가리고 원본 스냅샷의 숫자는 바꾸지 않는다.
export function EvidenceMap({
  report,
  onOpen,
  onViewClaim,
}: {
  report: ForecastReport;
  onOpen: OpenEvidence;
  onViewClaim: (id: string) => void;
}) {
  const data = useMemo(() => buildEvidenceMap(report), [report]);
  const [positions, setPositions] = useState<Map<
    string,
    { x: number; y: number }
  > | null>(null);
  const [layoutError, setLayoutError] = useState(false);
  const [selectedKinds, setSelectedKinds] =
    useState<Evidence["kind"][]>(mapEvidenceKinds);
  const [focusedKind, setFocusedKind] = useState<Evidence["kind"]>(
    mapEvidenceKinds[0],
  );
  const [table, setTable] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [flow, setFlow] = useState<ReactFlowInstance | null>(null);
  const frame = useRef<HTMLElement>(null);
  const filtered = useMemo(
    () => filterEvidenceMap(data, selectedKinds),
    [data, selectedKinds],
  );

  // 레이아웃은 스냅샷이 바뀔 때 한 번 계산하고 필터·창 크기에는 다시 계산하지 않는다.
  useEffect(() => {
    let cancelled = false;
    setPositions(null);
    setLayoutError(false);
    const layout = snapshotLayouts.get(report) ?? layoutEvidenceMap(data);
    snapshotLayouts.set(report, layout);
    layout
      .then((result) => {
        if (!cancelled) setPositions(result);
      })
      .catch(() => {
        snapshotLayouts.delete(report);
        if (!cancelled) setLayoutError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [data, report]);

  // 창 크기와 그래프 영역이 바뀌면 전체를 맞추되 좌표는 유지한다.
  useEffect(() => {
    if (
      !flow ||
      !positions ||
      table ||
      !frame.current ||
      !filtered.nodes.length
    )
      return;
    let animation = 0;
    const resizeView = () => {
      cancelAnimationFrame(animation);
      animation = requestAnimationFrame(() => {
        void flow.fitView({
          padding: 0.12,
          duration: 0,
          minZoom: 0.01,
          maxZoom: 1,
        });
      });
    };
    const observer = new ResizeObserver(resizeView);
    observer.observe(frame.current);
    resizeView();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(animation);
    };
  }, [flow, positions, table, filtered]);

  // 근거 종류 하나를 눌렀을 때 전체 선택에서 해당 종류만 보여 준다.
  const toggleKind = (kind: Evidence["kind"]) => {
    setSelectedKinds((current) => {
      if (current.length === mapEvidenceKinds.length) return [kind];
      const next = current.includes(kind)
        ? current.filter((item) => item !== kind)
        : [...current, kind];
      return next.length ? next : mapEvidenceKinds;
    });
    setActiveId(null);
  };
  const activePath = useMemo(
    () => (activeId ? connectedPath(filtered, activeId) : null),
    [filtered, activeId],
  );

  // 문장·근거·문서 노드의 동작을 원본 스냅샷과 같은 서랍으로 연결한다.
  const activate = useCallback(
    (item: MapNode, origin: HTMLElement) => {
      if (item.kind === "evidence" && item.referenceId)
        onOpen(item.referenceId, origin);
      if (item.kind === "claim" && item.referenceId)
        setSelectedClaimId(item.referenceId);
      if (item.kind === "document" && item.url)
        window.open(item.url, "_blank", "noopener,noreferrer");
      setActiveId(item.id);
    },
    [onOpen],
  );

  // 카드 순서는 예보서의 번호표와 일치시키고 초점 경로만 밝힌다.
  const nodes = useMemo(
    () =>
      positions
        ? flowPositions(filtered, positions).map((node) => {
            const item = node.data.item;
            const number =
              item.kind === "evidence" && item.referenceId
                ? (evidenceNumber(item.referenceId, report.evidence) ??
                  undefined)
                : undefined;
            return {
              ...node,
              data: {
                item,
                number,
                dimmed: Boolean(activePath && !activePath.has(item.id)),
                selected:
                  item.referenceId === selectedClaimId && item.kind === "claim",
                onActivate: activate,
                onFocusPath: setActiveId,
              } satisfies MapNodeData,
            };
          })
        : [],
    [
      filtered,
      positions,
      report.evidence,
      activePath,
      selectedClaimId,
      activate,
    ],
  );
  const edges = useMemo(
    () =>
      flowEdges(filtered).map((edge) => ({
        ...edge,
        className:
          activePath &&
          !(activePath.has(edge.source) && activePath.has(edge.target))
            ? "is-dimmed"
            : "",
      })),
    [filtered, activePath],
  );
  const selectedClaim = data.nodes.find(
    (node) => node.id === `claim:${selectedClaimId}`,
  );

  // 그래프가 비거나 배치에 실패해도 표를 열어 같은 자료를 읽을 수 있다.
  return (
    <section className="evidence-map" aria-labelledby="evidence-map-title">
      <div className="evidence-map__heading">
        <div>
          <h2 id="evidence-map-title">근거 지도</h2>
          <p>문장부터 근거와 원문 자료까지 연결을 따라가요.</p>
          <Link to="/graph">전체 근거 그래프 보기</Link>
        </div>
        <button type="button" onClick={() => setTable((value) => !value)}>
          {table ? "그래프로 보기" : "표로 보기"}
        </button>
      </div>
      <p className="evidence-map__summary">
        발행 문장 {data.claimCount}개 · 근거 {data.evidenceCount}개 ·
        데이터랩까지 이어지는 문장 {data.datalabClaimCount}개
      </p>
      <fieldset className="evidence-map__filters">
        <legend>근거 종류 필터</legend>
        {mapEvidenceKinds.map((kind) => {
          const { Icon, label } = evidenceKinds[kind];
          return (
            <button
              key={kind}
              type="button"
              aria-pressed={selectedKinds.includes(kind)}
              tabIndex={focusedKind === kind ? 0 : -1}
              onFocus={() => setFocusedKind(kind)}
              onKeyDown={(event) =>
                focusEvidenceKind(event, kind, setFocusedKind)
              }
              onClick={() => {
                setFocusedKind(kind);
                toggleKind(kind);
              }}
            >
              <Icon size={15} aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </fieldset>
      {selectedClaim && (
        <div className="evidence-map__selection" role="status">
          <p>{selectedClaim.label}</p>
          <button
            type="button"
            onClick={() => {
              if (selectedClaim.referenceId)
                onViewClaim(selectedClaim.referenceId);
            }}
          >
            예보서에서 보기
          </button>
        </div>
      )}
      {table ? (
        <EvidenceMapTable report={report} data={filtered} onOpen={onOpen} />
      ) : (
        <section
          className="evidence-map__canvas"
          ref={frame}
          aria-label="발행 문장과 근거 연결 그래프"
        >
          {layoutError ? (
            <p role="alert">
              지도를 배치할 수 없어요. 표로 보기를 이용해 주세요.
            </p>
          ) : !data.nodes.length ? (
            <p>표시할 발행 근거가 없어요.</p>
          ) : !positions ? (
            <p role="status">근거 지도를 배치하고 있어요.</p>
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
    </section>
  );
}
