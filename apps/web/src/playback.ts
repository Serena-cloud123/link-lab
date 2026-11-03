import type {
  PathEvent,
  RunResult,
  StepId,
  StepOutcome
} from "@link-lab/contracts";

/** 播放下标钳制到 events 合法范围；空数组返回 0。 */
export function clampIndex(events: PathEvent[], index: number): number {
  if (events.length === 0) return 0;
  if (index < 0) return 0;
  if (index > events.length - 1) return events.length - 1;
  return index;
}

/** 派生单个当前事件的静态图视图。只取值映射，不做路径判定。 */
export interface PlaybackView {
  /** 事件下标（经 clamp 后）。 */
  index: number;
  /** 当前事件；空 events 时为 null。 */
  event: PathEvent | null;
  /** 当前事件对应的物理边 id：`from->to`；无事件时 null。 */
  currentEdgeId: string | null;
  /** 当前边的逻辑标签：`路径 X · stepId · 状态中文`；无事件时空串。 */
  currentEdgeLabel: string;
  /** 事件 outcome，空时为 null。 */
  outcome: StepOutcome | null;
  /** 若 outcome===data-arrived 则为 "N7"；否则 null。 */
  arrivedNodeId: string | null;
  /** 若事件带 alert 则为 interfaceNodeId；否则 null。 */
  alertNodeId: string | null;
  /** rejected 时该事件中所有 satisfied=false 的 check.reason 原样数组。 */
  unmetReasons: string[];
  /** skipped 时同路径最近一个 rejected 事件（可能在 0..index-1）；否则 null。 */
  priorRejected: PathEvent | null;
  /** rejected 时该 step 应停靠在 from→to 的哪一比例（0–1）；其他 outcome 为 null。 */
  rejectedStopFraction: number | null;
  /** 图下方固定一行锚定文案：`当前事件：路径 X · stepId（状态）`。 */
  graphAnchor: string;
}

const OUTCOME_TEXT: Record<StepOutcome, string> = {
  passed: "已通过",
  rejected: "已拒绝",
  skipped: "未执行",
  "data-arrived": "数据到达"
};

/**
 * 每个 stepId 对应的 rejected 停靠比例（from→to 方向上的 0–1 值）。
 * 依据步骤元数据手工判定，不做路径判定：
 *   A3  D1 护栏在 N3（管理导出接口）处，停靠在靠近 from 的 12% 位置；
 *   B2  O 条件检查发生在进入 N4（诊断页面）前，停靠在 90% 处；
 *   B5  T 权限 / D2 护栏在 N6→N7 途中，停靠在 82% 处。
 * 其他 stepId 非阻塞场景，占位 0.5 不会被使用。
 */
const REJECTED_STOP_FRACTION: Record<StepId, number> = {
  A1: 0.5,
  A2: 0.5,
  A3: 0.12,
  B1: 0.5,
  B2: 0.9,
  B3: 0.5,
  B4: 0.5,
  B5: 0.82
};

export function derivePlaybackView(
  result: RunResult,
  index: number
): PlaybackView {
  const events = result.events;
  const clamped = clampIndex(events, index);

  if (events.length === 0) {
    return {
      index: 0,
      event: null,
      currentEdgeId: null,
      currentEdgeLabel: "",
      outcome: null,
      arrivedNodeId: null,
      alertNodeId: null,
      unmetReasons: [],
      priorRejected: null,
      rejectedStopFraction: null,
      graphAnchor: "当前事件：暂无运行结果"
    };
  }

  const event = events[clamped];
  const edgeId = `${event.fromNodeId}->${event.toNodeId}`;
  const label = `路径 ${event.pathId} · ${event.stepId} · ${OUTCOME_TEXT[event.outcome]}`;

  const alertNodeId = event.alert?.interfaceNodeId ?? null;
  const arrivedNodeId = event.outcome === "data-arrived" ? "N7" : null;
  const unmetReasons =
    event.outcome === "rejected"
      ? event.conditionChecks.filter((c) => !c.satisfied).map((c) => c.reason)
      : [];
  const priorRejected =
    event.outcome === "skipped"
      ? events
          .slice(0, clamped)
          .filter((e) => e.outcome === "rejected" && e.pathId === event.pathId)
          .at(-1) ?? null
      : null;
  const rejectedStopFraction =
    event.outcome === "rejected"
      ? REJECTED_STOP_FRACTION[event.stepId]
      : null;

  return {
    index: clamped,
    event,
    currentEdgeId: edgeId,
    currentEdgeLabel: label,
    outcome: event.outcome,
    arrivedNodeId,
    alertNodeId,
    unmetReasons,
    priorRejected,
    rejectedStopFraction,
    graphAnchor: `当前事件：路径 ${event.pathId} · ${event.stepId}（${OUTCOME_TEXT[event.outcome]}）`
  };
}

/** 残余路径说明的整理结果；只有两个字段，组件直接渲染。 */
export interface ResidualPathReport {
  /** 若有 reached 路径则是每路径一条说明数组；否则空数组。 */
  lines: string[];
  /** 两路都阻断时为真；此时 lines 为空。 */
  allBlocked: boolean;
}

/**
 * 只读 pathResults 与 events。
 * - reached 路径：引用该路径所有 passed / data-arrived 事件的 conditionChecks.reason，
 *   去重后原样拼接；若该路径所有已执行步骤都没有 conditionChecks，追加固定文案
 *   "该路径的各步骤均无额外条件检查，按基础步骤到达"。
 * - 两路都 blocked：返回 allBlocked=true，由调用方输出单句"两条已建模路径均未到达模拟数据"。
 * 前端不硬编码任何 reason，全部来自引擎事件。
 */
export function buildResidualReport(result: RunResult): ResidualPathReport {
  const reached = result.pathResults.filter((p) => p.outcome === "reached");
  if (reached.length === 0) {
    return { lines: [], allBlocked: true };
  }

  const lines: string[] = reached.map((pathResult) => {
    const executed = result.events.filter(
      (e) =>
        e.pathId === pathResult.pathId &&
        (e.outcome === "passed" || e.outcome === "data-arrived")
    );

    // 按 stepId:checkId 去重，保留首次出现顺序
    const seen = new Set<string>();
    const reasons: string[] = [];
    for (const event of executed) {
      for (const check of event.conditionChecks) {
        const key = `${event.stepId}:${check.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          reasons.push(`${event.stepId} · ${check.id}「${check.reason}」`);
        }
      }
    }

    const header = `路径 ${pathResult.pathId} 仍到达模拟数据。依据（引擎已记录的条件检查）`;
    if (reasons.length === 0) {
      return `${header}：该路径的各步骤均无额外条件检查，按基础步骤到达。`;
    }
    return `${header}：${reasons.join("；")}。`;
  });

  return { lines, allBlocked: false };
}
