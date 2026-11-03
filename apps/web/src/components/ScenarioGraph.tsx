import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties
} from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  MarkerType,
  BaseEdge,
  getBezierPath,
  type Edge,
  type EdgeProps,
  type Node
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Scenario, StepOutcome } from "@link-lab/contracts";
import type { PlaybackView } from "../playback";

const NODE_WIDTH = 180;

/**
 * 拼 CSS 属性选择器字符串时的最小转义（反斜杠与双引号）。
 * 所有按 id 拼选择器的地方都必须经过它，避免 id 中的特殊字符（如边 id 里的 ">"）
 * 把选择器变成合法但永远匹配不到的写法。
 */
function escapeAttr(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * 活动流线的归一化长度：overlay path 统一声明 pathLength=100，
 * stroke-dasharray 固定 "8 100"（单个小划 + 大间隔），周期为 108。
 * stroke-dashoffset 从 108 → 0 即「从 from 端走到 to 端再离开」，
 * 与真实像素长度无关，jsdom / 任意缩放级别下都成立。
 */
const FLOW_PERIOD = 108;

interface GraphEdge extends Edge {
  stepIds: string[];
}

/** 自定义边 data：只传渲染所需字段，不做任何路径判定。 */
type LabEdgeData = {
  /** 当前事件 outcome；非活动边为 null。 */
  outcome: StepOutcome | null;
  /** rejected 时的停靠比例（0–1，来自 playback 步骤元数据）；否则 null。 */
  rejectedStopFraction: number | null;
  animationsEnabled: boolean;
  /** runEpoch-eventIndex-anim：变化即 remount，旧动画 DOM 直接卸载。 */
  wrapperKey: string;
};

type LabEdgeType = Edge<LabEdgeData, "lab">;

/**
 * 自定义边：底线路径与 label 完全复刻内置 BezierEdge（同一 BaseEdge 渲染），
 * 并在同一边 <g> 内追加活动流线 overlay path。
 * 与底图共享同一 pane transform，天然坐标对齐；
 * d 由 getBezierPath 现算，无需 querySelector 取 DOM。
 */
function LabEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  style,
  markerEnd,
  data
}: EdgeProps<LabEdgeType>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition
  });

  const outcome = data?.outcome ?? null;
  const animationsEnabled = data?.animationsEnabled ?? false;
  // skipped 与非活动边没有活动流线；事件是否带 alert 不影响主流线
  const showFlow =
    animationsEnabled && outcome !== null && outcome !== "skipped";

  // rejected：停靠点 dashoffset 目标 = 周期 - 比例 * 100；其余 outcome 走完全程
  const flowTarget =
    outcome === "rejected" && data?.rejectedStopFraction != null
      ? FLOW_PERIOD - data.rejectedStopFraction * 100
      : null;

  const flowStyle: CSSProperties = {
    // inline 写死 dasharray，避免继承 .graph-edge-active.graph-edge-rejected 的虚线
    strokeDasharray: "8 100",
    ...(flowTarget != null
      ? ({ [`--flow-target`]: `${flowTarget}` } as CSSProperties)
      : {})
  };

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        labelX={labelX}
        labelY={labelY}
        label={label}
        style={style}
        markerEnd={markerEnd}
      />
      {showFlow && outcome ? (
        <path
          key={data?.wrapperKey}
          className={`flow-overlay-path flow-overlay-path-${outcome}`}
          d={edgePath}
          pathLength={100}
          fill="none"
          aria-hidden="true"
          style={flowStyle}
        />
      ) : null}
    </>
  );
}

const edgeTypes = { lab: LabEdge };

interface ScenarioGraphProps {
  scenario: Scenario;
  view?: PlaybackView | null;
  /** 是否允许播放动画；关闭后只显示静态状态。 */
  animationsEnabled?: boolean;
  /** 用于强制取消旧动画的 epoch；每次 run / 切预设 / 重载场景递增。 */
  runEpoch?: number;
}

/** 在 ReactFlowProvider 内部访问节点屏幕坐标的子组件。 */
function GraphInner({
  scenario,
  view,
  animationsEnabled,
  runEpoch
}: ScenarioGraphProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // ReactFlow 实例是否就绪：用 state 表达，保证就绪后定位 effect 一定重跑
  const [rfReady, setRfReady] = useState(false);
  // 告警脉冲 overlay 的屏幕坐标（相对 graph-container）
  const [alertOverlayPos, setAlertOverlayPos] = useState<{
    left: number;
    top: number;
  } | null>(null);
  // 数据到达脉冲 overlay 的屏幕坐标（相对 graph-container）
  const [arrivedOverlayPos, setArrivedOverlayPos] = useState<{
    left: number;
    top: number;
  } | null>(null);

  const activeEdgeId = view?.currentEdgeId ?? null;
  const alertNodeId = view?.alertNodeId ?? null;
  const arrivedNodeId = view?.arrivedNodeId ?? null;
  const outcome = view?.outcome ?? null;

  const nodes = useMemo<Node[]>(
    () =>
      scenario.nodes.map((node) => {
        const classes: string[] = ["graph-node"];
        if (alertNodeId === node.id) classes.push("graph-node-alert");
        if (arrivedNodeId === node.id) classes.push("graph-node-arrived");
        return {
          id: node.id,
          position: { x: node.canvasX - NODE_WIDTH / 2, y: node.canvasY },
          data: {
            label: (
              <span className="graph-node-label">
                <strong>{node.label}</strong>
                <small>{node.description}</small>
                {alertNodeId === node.id ? (
                  <span className="graph-node-alert-badge" title="检测到敏感请求">
                    ⚠
                  </span>
                ) : null}
                {arrivedNodeId === node.id ? (
                  <span className="graph-node-arrived-badge" title="报名明细已到达">
                    ● 已到达
                  </span>
                ) : null}
              </span>
            )
          },
          style: { width: NODE_WIDTH },
          className: classes.join(" "),
          draggable: false
        };
      }),
    [scenario, alertNodeId, arrivedNodeId]
  );

  const wrapperKey = `${runEpoch ?? 0}-${view?.index ?? 0}-${animationsEnabled ? 1 : 0}`;

  const edges = useMemo<Edge[]>(() => {
    const map = new Map<string, GraphEdge>();
    for (const path of scenario.paths) {
      for (const step of path.steps) {
        const id = `${step.from}->${step.to}`;
        const existing = map.get(id);
        if (existing) {
          existing.stepIds.push(step.id);
          existing.label = existing.stepIds.join(" / ");
        } else {
          map.set(id, {
            id,
            source: step.from,
            target: step.to,
            label: step.id,
            stepIds: [step.id],
            markerEnd: { type: MarkerType.ArrowClosed }
          });
        }
      }
    }

    return [...map.values()].map((edge) => {
      const isActive = activeEdgeId === edge.id;
      const classes: string[] = ["graph-edge"];
      let label = edge.label;
      let strokeWidth: number | undefined;
      let stroke: string | undefined;

      if (isActive && outcome) {
        classes.push(`graph-edge-active`);
        classes.push(`graph-edge-${outcome}`);
        label = view?.currentEdgeLabel ?? label;
        strokeWidth = 3;
        if (outcome === "passed") stroke = "#7fc8b5";
        else if (outcome === "data-arrived") stroke = "#7fc8b5";
        else if (outcome === "rejected") stroke = "#c25e5e";
        else if (outcome === "skipped") stroke = "#5a6a7a";
      } else {
        classes.push("graph-edge-idle");
      }

      return {
        ...edge,
        type: "lab",
        className: classes.join(" "),
        label,
        animated: false,
        style: { strokeWidth, stroke },
        data: {
          outcome: isActive ? outcome : null,
          rejectedStopFraction:
            isActive && outcome === "rejected"
              ? (view?.rejectedStopFraction ?? null)
              : null,
          animationsEnabled: animationsEnabled ?? false,
          wrapperKey
        }
      };
    });
  }, [scenario, activeEdgeId, outcome, view, animationsEnabled, wrapperKey]);

  /**
   * alert / arrived overlay 定位：读节点 DOM 的 getBoundingClientRect，
   * 换算为相对 graph-container 左上角的坐标，跟随 fitView 缩放与面板折叠；
   * 另监听 window resize 重算。实例就绪用 rfReady state 表达并加入依赖。
   */
  useEffect(() => {
    if (!rfReady) return;
    const update = () => {
      const container = containerRef.current;
      if (!container) return;
      const containerRect = container.getBoundingClientRect();
      const centerOf = (nodeId: string): { left: number; top: number } | null => {
        const el = container.querySelector(
          `.react-flow__node[data-id="${escapeAttr(nodeId)}"]`
        ) as HTMLElement | null;
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return {
          left: rect.left - containerRect.left + rect.width / 2,
          top: rect.top - containerRect.top + rect.height / 2
        };
      };
      setAlertOverlayPos(alertNodeId ? centerOf(alertNodeId) : null);
      setArrivedOverlayPos(arrivedNodeId ? centerOf(arrivedNodeId) : null);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [rfReady, alertNodeId, arrivedNodeId, animationsEnabled, runEpoch]);

  return (
    <div
      ref={containerRef}
      className={`graph-container ${animationsEnabled ? "animations-enabled" : ""}`}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        colorMode="dark"
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        elementsSelectable={false}
        zoomOnDoubleClick={false}
        minZoom={0.2}
        onInit={() => setRfReady(true)}
      />

      {/* alert 侧向脉冲 overlay：来源是当前事件对象上的 alert 字段（见 playback.ts），
       *  不是 defenses 是否包含 D3；skipped / rejected 事件 alertNodeId 为 null，不渲染。 */}
      {animationsEnabled && alertNodeId && alertOverlayPos ? (
        <div
          key={`alert-${wrapperKey}`}
          className="alert-pulse-overlay"
          aria-hidden="true"
          style={{
            position: "absolute",
            left: alertOverlayPos.left + 40,
            top: alertOverlayPos.top,
            transform: "translate(-50%, -50%)",
            pointerEvents: "none"
          }}
        />
      ) : null}

      {/* data-arrived N7 脉冲徽标（仅开动画时播放 scale 脉冲），定位在到达节点中心 */}
      {animationsEnabled &&
      outcome === "data-arrived" &&
      arrivedNodeId &&
      arrivedOverlayPos ? (
        <div
          key={`arrived-${wrapperKey}`}
          className="arrived-pulse-overlay"
          aria-hidden="true"
          style={{
            left: arrivedOverlayPos.left,
            top: arrivedOverlayPos.top
          }}
        />
      ) : null}

      {view?.graphAnchor ? (
        <p className="graph-anchor">{view.graphAnchor}</p>
      ) : null}
    </div>
  );
}

/** 对外包装：ReactFlowProvider 负责注入 ReactFlowInstance 上下文。 */
export function ScenarioGraph(props: ScenarioGraphProps) {
  return (
    <ReactFlowProvider>
      <GraphInner {...props} />
    </ReactFlowProvider>
  );
}
