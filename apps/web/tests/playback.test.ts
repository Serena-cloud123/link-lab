import { describe, expect, it } from "vitest";
import type { PathEvent, RunResult } from "@link-lab/contracts";
import {
  buildResidualReport,
  clampIndex,
  derivePlaybackView
} from "../src/playback";

// 复制引擎同构的 8 事件样本，避免前端自己发明规则
function engineLikeA1(): PathEvent {
  return {
    eventIndex: 0,
    pathId: "A",
    stepId: "A1",
    fromNodeId: "N1",
    toNodeId: "N2",
    outcome: "passed",
    conditionChecks: []
  };
}
function engineLikeA2(d3Enabled: boolean): PathEvent {
  const base: PathEvent = {
    eventIndex: 1,
    pathId: "A",
    stepId: "A2",
    fromNodeId: "N2",
    toNodeId: "N3",
    outcome: "passed",
    conditionChecks: []
  };
  if (d3Enabled) {
    base.alert = {
      defenseId: "D3",
      interfaceNodeId: "N3",
      reason: "请求到达敏感接口 N3，D3 已记录告警"
    };
  }
  return base;
}
function engineLikeA3(d1Enabled: boolean): PathEvent {
  const d1Check = {
    id: "D1" as const,
    actualValue: d1Enabled,
    satisfied: !d1Enabled,
    reason: d1Enabled
      ? "D1 已开启，管理导出接口拒绝请求"
      : "D1 未开启，请求继续前往报名明细"
  };
  return {
    eventIndex: 2,
    pathId: "A",
    stepId: "A3",
    fromNodeId: "N3",
    toNodeId: "N7",
    outcome: d1Enabled ? "rejected" : "data-arrived",
    conditionChecks: [d1Check]
  };
}
function engineLikeB1(): PathEvent {
  return {
    eventIndex: 3,
    pathId: "B",
    stepId: "B1",
    fromNodeId: "N1",
    toNodeId: "N2",
    outcome: "passed",
    conditionChecks: []
  };
}
function engineLikeB2(oOpen: boolean): PathEvent {
  return {
    eventIndex: 4,
    pathId: "B",
    stepId: "B2",
    fromNodeId: "N2",
    toNodeId: "N4",
    outcome: oOpen ? "passed" : "rejected",
    conditionChecks: [
      {
        id: "O",
        actualValue: oOpen ? "open" : "closed",
        satisfied: oOpen,
        reason: oOpen
          ? "诊断页面对普通账号开放，可继续访问"
          : "诊断页面对普通账号关闭，访问被拒绝"
      }
    ]
  };
}
function engineLikeB3(b2Rejected: boolean): PathEvent {
  return {
    eventIndex: 5,
    pathId: "B",
    stepId: "B3",
    fromNodeId: "N4",
    toNodeId: "N5",
    outcome: b2Rejected ? "skipped" : "passed",
    conditionChecks: []
  };
}
function engineLikeB4(b2Rejected: boolean, d3Enabled: boolean): PathEvent {
  const base: PathEvent = {
    eventIndex: 6,
    pathId: "B",
    stepId: "B4",
    fromNodeId: "N5",
    toNodeId: "N6",
    outcome: b2Rejected ? "skipped" : "passed",
    conditionChecks: []
  };
  if (!b2Rejected && d3Enabled) {
    base.alert = {
      defenseId: "D3",
      interfaceNodeId: "N6",
      reason: "请求到达敏感接口 N6，D3 已记录告警"
    };
  }
  return base;
}
function engineLikeB5(b2Rejected: boolean, tGranted: boolean, d2Enabled: boolean): PathEvent {
  const b5Rejected = !b2Rejected && (!tGranted || d2Enabled);
  const tCheck = {
    id: "T" as const,
    actualValue: tGranted ? "granted" : "revoked",
    satisfied: tGranted,
    reason: tGranted
      ? "服务令牌持有报名明细读取权限"
      : "服务令牌无报名明细读取权限，请求被拒绝"
  };
  const d2Check = {
    id: "D2" as const,
    actualValue: d2Enabled,
    satisfied: !d2Enabled,
    reason: d2Enabled
      ? "D2 已开启，服务令牌权限已收紧，请求被拒绝"
      : "D2 未开启，服务令牌权限未收紧"
  };
  const checks = b2Rejected ? [] : [tCheck, d2Check];
  return {
    eventIndex: 7,
    pathId: "B",
    stepId: "B5",
    fromNodeId: "N6",
    toNodeId: "N7",
    outcome: b2Rejected ? "skipped" : b5Rejected ? "rejected" : "data-arrived",
    conditionChecks: checks
  };
}

function buildResult(opts: {
  d1: boolean;
  d2: boolean;
  d3: boolean;
  oOpen: boolean;
  tGranted: boolean;
}): RunResult {
  const events = [
    engineLikeA1(),
    engineLikeA2(opts.d3),
    engineLikeA3(opts.d1),
    engineLikeB1(),
    engineLikeB2(opts.oOpen),
    engineLikeB3(!opts.oOpen),
    engineLikeB4(!opts.oOpen, opts.d3),
    engineLikeB5(!opts.oOpen, opts.tGranted, opts.d2)
  ];
  const pathA = opts.d1
    ? {
        pathId: "A" as const,
        outcome: "blocked" as const,
        firstBlockedStepId: "A3" as const,
        blockedReason: "D1 已开启，管理导出接口拒绝请求"
      }
    : { pathId: "A" as const, outcome: "reached" as const };
  const b2Rejected = !opts.oOpen;
  const b5Rejected = !opts.tGranted || opts.d2;
  const pathB = b2Rejected
    ? {
        pathId: "B" as const,
        outcome: "blocked" as const,
        firstBlockedStepId: "B2" as const,
        blockedReason: "诊断页面对普通账号关闭，访问被拒绝"
      }
    : b5Rejected
      ? {
          pathId: "B" as const,
          outcome: "blocked" as const,
          firstBlockedStepId: "B5" as const,
          blockedReason: checks(opts).filter((c) => !c.satisfied).map((c) => c.reason).join("；")
        }
      : { pathId: "B" as const, outcome: "reached" as const };
  return {
    events,
    pathResults: [pathA, pathB],
    alertCount: opts.d3 ? (opts.oOpen ? 2 : 1) : 0
  };
}

function checks(opts: { oOpen: boolean; tGranted: boolean; d2: boolean }) {
  const tGranted = opts.tGranted;
  return [
    {
      id: "T" as const,
      actualValue: tGranted ? "granted" : "revoked",
      satisfied: tGranted,
      reason: tGranted
        ? "服务令牌持有报名明细读取权限"
        : "服务令牌无报名明细读取权限，请求被拒绝"
    },
    {
      id: "D2" as const,
      actualValue: opts.d2,
      satisfied: !opts.d2,
      reason: opts.d2
        ? "D2 已开启，服务令牌权限已收紧，请求被拒绝"
        : "D2 未开启，服务令牌权限未收紧"
    }
  ];
}

describe("clampIndex", () => {
  const evts: PathEvent[] = [{
    eventIndex: 0, pathId: "A", stepId: "A1",
    fromNodeId: "N1", toNodeId: "N2", outcome: "passed", conditionChecks: []
  }];
  it("空 events 返回 0", () => {
    expect(clampIndex([], 5)).toBe(0);
  });
  it("-1 钳到 0", () => {
    expect(clampIndex(evts, -1)).toBe(0);
  });
  it("9 钳到 events.length-1", () => {
    expect(clampIndex(evts, 9)).toBe(0);
  });
});

describe("derivePlaybackView", () => {
  it("A1 与 B1 同物理边但 pathId/stepId 区分", () => {
    const r = buildResult({ d1: false, d2: false, d3: false, oOpen: true, tGranted: true });
    const v0 = derivePlaybackView(r, 0);
    const v3 = derivePlaybackView(r, 3);
    expect(v0.currentEdgeId).toBe("N1->N2");
    expect(v3.currentEdgeId).toBe("N1->N2");
    expect(v0.graphAnchor).toContain("A1");
    expect(v3.graphAnchor).toContain("B1");
    expect(v0.graphAnchor).not.toContain("B1");
    expect(v3.graphAnchor).not.toContain("A1");
  });

  it("A3 在 D1 开启时为 rejected，带出 D1 未满足理由", () => {
    const r = buildResult({ d1: true, d2: false, d3: false, oOpen: true, tGranted: true });
    const v = derivePlaybackView(r, 2);
    expect(v.outcome).toBe("rejected");
    expect(v.unmetReasons).toEqual(["D1 已开启，管理导出接口拒绝请求"]);
  });

  it("B5 在 T=revoked + D2 开启时给出两条未满足理由（原样来自引擎 reason）", () => {
    const r = buildResult({ d1: false, d2: true, d3: false, oOpen: true, tGranted: false });
    const v = derivePlaybackView(r, 7);
    expect(v.outcome).toBe("rejected");
    // 两条未满足：T revoked + D2 enabled
    expect(v.unmetReasons).toHaveLength(2);
    // 原样取自 engine reason 字段，前端不得硬编码
    expect(v.unmetReasons.some((s) => s.includes("报名明细读取权限"))).toBe(true);
    expect(v.unmetReasons.some((s) => s.includes("服务令牌权限已收紧"))).toBe(true);
  });

  it("skipped B3/B4 无高亮，priorRejected 为 B2", () => {
    const r = buildResult({ d1: false, d2: false, d3: false, oOpen: false, tGranted: true });
    const v5 = derivePlaybackView(r, 5);
    expect(v5.outcome).toBe("skipped");
    expect(v5.currentEdgeLabel).toContain("未执行");
    expect(v5.priorRejected?.stepId).toBe("B2");
    // B4 在 O 关闭时也是 skipped，且无 alert（即使有 D3）
    const r2 = buildResult({ d1: false, d2: false, d3: true, oOpen: false, tGranted: true });
    const v6 = derivePlaybackView(r2, 6);
    expect(v6.outcome).toBe("skipped");
    expect(v6.alertNodeId).toBeNull();
  });

  it("data-arrived 给出 N7 到达标记；A2 带 alert 时 alertNodeId=N3 且 outcome 仍 passed", () => {
    const r = buildResult({ d1: false, d2: false, d3: true, oOpen: true, tGranted: true });
    const v2 = derivePlaybackView(r, 2);
    expect(v2.outcome).toBe("data-arrived");
    expect(v2.arrivedNodeId).toBe("N7");

    const v1 = derivePlaybackView(r, 1);
    expect(v1.outcome).toBe("passed");
    expect(v1.alertNodeId).toBe("N3");
  });
});

describe("buildResidualReport", () => {
  it("A blocked + B reached：引用 B2/B5 条件检查（原样 reason）", () => {
    const r = buildResult({ d1: true, d2: false, d3: false, oOpen: true, tGranted: true });
    const rep = buildResidualReport(r);
    expect(rep.allBlocked).toBe(false);
    expect(rep.lines).toHaveLength(1);
    const line = rep.lines[0];
    expect(line).toContain("路径 B 仍到达模拟数据");
    expect(line).toContain("B2 · O「诊断页面对普通账号开放，可继续访问」");
    expect(line).toContain("B5 · T「服务令牌持有报名明细读取权限」");
    expect(line).toContain("B5 · D2「D2 未开启，服务令牌权限未收紧」");
    // 不得包含硬编码的「阅读权限」
    expect(line).not.toContain("阅读权限");
  });

  it("两路都 blocked：allBlocked=true，调用方输出单句；不得出现系统已安全", () => {
    const r = buildResult({ d1: true, d2: false, d3: false, oOpen: false, tGranted: true });
    const rep = buildResidualReport(r);
    expect(rep.allBlocked).toBe(true);
    expect(rep.lines).toEqual([]);
  });

  it("reached 路径所有事件 conditionChecks 为空时追加固定文案", () => {
    // A 路径 reached 且 D1 未开启 → A1/A2/A3 的 conditionChecks 只有 A3 里 D1 satisfied，
    // 但 A1/A2 为空。让我们让 B 路径完全无 checks —— 在 B5 data-arrived 但 D2 未开且 T granted 时，
    // conditionChecks 其实是 [T satisfied, D2 satisfied]。要做到完全空，只能构造一个所有 step 都
    // 不带 conditionChecks 的场景。所以这里改为直接手动构造 RunResult。
    const manual: RunResult = {
      events: [
        { eventIndex: 0, pathId: "A", stepId: "A1", fromNodeId: "N1", toNodeId: "N2", outcome: "passed", conditionChecks: [] },
        { eventIndex: 1, pathId: "A", stepId: "A2", fromNodeId: "N2", toNodeId: "N3", outcome: "passed", conditionChecks: [] },
        { eventIndex: 2, pathId: "A", stepId: "A3", fromNodeId: "N3", toNodeId: "N7", outcome: "data-arrived", conditionChecks: [] },
        // 路径 B 全部被 D2（但 conditionChecks 带 D2）
      ],
      pathResults: [
        { pathId: "A", outcome: "reached" },
        { pathId: "B", outcome: "blocked" }
      ],
      alertCount: 0
    };
    const rep = buildResidualReport(manual);
    expect(rep.allBlocked).toBe(false);
    expect(rep.lines[0]).toContain("该路径的各步骤均无额外条件检查，按基础步骤到达");
  });
});
