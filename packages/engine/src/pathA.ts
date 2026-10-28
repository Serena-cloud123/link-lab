import type {
  ConditionCheck,
  DefenseId,
  NodeId,
  PathEvent,
  PathResult,
  RunInput,
  Scenario,
  StepId
} from "@link-lab/contracts";

export interface PathAEvaluation {
  events: PathEvent[];
  pathResult: PathResult;
}

function findPathAStep(scenario: Scenario, stepId: StepId) {
  const pathA = scenario.paths.find((path) => path.id === "A");
  const step = pathA?.steps.find((item) => item.id === stepId);

  if (!step) {
    throw new Error(`场景 ${scenario.id} 中找不到路径 A 的步骤 ${stepId}`);
  }

  return step;
}

function hasDefense(defenses: DefenseId[], defense: DefenseId): boolean {
  return defenses.includes(defense);
}

/**
 * 只评估路径 A。O、T、D2、presetId 不参与判断。
 * 事件下标固定为 A1=0、A2=1、A3=2，仅表示展示顺序。
 */
export function evaluatePathA(scenario: Scenario, input: RunInput): PathAEvaluation {
  const a1 = findPathAStep(scenario, "A1");
  const a2 = findPathAStep(scenario, "A2");
  const a3 = findPathAStep(scenario, "A3");

  const d1Enabled = hasDefense(input.defenses, "D1");
  const d3Enabled = hasDefense(input.defenses, "D3");

  const d1Check: ConditionCheck = {
    id: "D1",
    actualValue: d1Enabled,
    satisfied: !d1Enabled,
    reason: d1Enabled
      ? "D1 已开启，管理导出接口拒绝请求"
      : "D1 未开启，请求继续前往报名明细"
  };

  const arrivalNodeId: NodeId = a2.sensitiveArrival ?? a2.to;

  const events: PathEvent[] = [
    {
      eventIndex: 0,
      pathId: "A",
      stepId: "A1",
      fromNodeId: a1.from,
      toNodeId: a1.to,
      outcome: "passed",
      conditionChecks: []
    },
    {
      eventIndex: 1,
      pathId: "A",
      stepId: "A2",
      fromNodeId: a2.from,
      toNodeId: a2.to,
      outcome: "passed",
      conditionChecks: [],
      ...(d3Enabled
        ? {
            alert: {
              defenseId: "D3" as const,
              interfaceNodeId: arrivalNodeId,
              reason: `请求到达敏感接口 ${arrivalNodeId}，D3 已记录告警`
            }
          }
        : {})
    },
    {
      eventIndex: 2,
      pathId: "A",
      stepId: "A3",
      fromNodeId: a3.from,
      toNodeId: a3.to,
      outcome: d1Enabled ? "rejected" : "data-arrived",
      conditionChecks: [d1Check]
    }
  ];

  const pathResult: PathResult = d1Enabled
    ? {
        pathId: "A",
        outcome: "blocked",
        firstBlockedStepId: "A3",
        blockedReason: d1Check.reason
      }
    : { pathId: "A", outcome: "reached" };

  return { events, pathResult };
}
