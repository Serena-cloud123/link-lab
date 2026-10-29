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

export interface PathBEvaluation {
  events: PathEvent[];
  pathResult: PathResult;
}

function findPathBStep(scenario: Scenario, stepId: StepId) {
  const pathB = scenario.paths.find((path) => path.id === "B");
  const step = pathB?.steps.find((item) => item.id === stepId);

  if (!step) {
    throw new Error(`场景 ${scenario.id} 中找不到路径 B 的步骤 ${stepId}`);
  }

  return step;
}

function hasDefense(defenses: DefenseId[], defense: DefenseId): boolean {
  return defenses.includes(defense);
}

/**
 * 只评估路径 B。D1、presetId 不参与判断；以 input.conditions 为准。
 * 事件下标固定为 B1=3、B2=4、B3=5、B4=6、B5=7，仅表示展示顺序。
 */
export function evaluatePathB(scenario: Scenario, input: RunInput): PathBEvaluation {
  const b1 = findPathBStep(scenario, "B1");
  const b2 = findPathBStep(scenario, "B2");
  const b3 = findPathBStep(scenario, "B3");
  const b4 = findPathBStep(scenario, "B4");
  const b5 = findPathBStep(scenario, "B5");

  const oOpen = input.conditions.O === "open";
  const tGranted = input.conditions.T === "granted";
  const d2Enabled = hasDefense(input.defenses, "D2");
  const d3Enabled = hasDefense(input.defenses, "D3");

  const b2Check: ConditionCheck = {
    id: "O",
    actualValue: input.conditions.O,
    satisfied: oOpen,
    reason: oOpen
      ? "诊断页面对普通账号开放，可继续访问"
      : "诊断页面对普通账号关闭，访问被拒绝"
  };

  const b5Checks: ConditionCheck[] = [
    {
      id: "T",
      actualValue: input.conditions.T,
      satisfied: tGranted,
      reason: tGranted
        ? "服务令牌持有报名明细读取权限"
        : "服务令牌无报名明细读取权限，请求被拒绝"
    },
    {
      id: "D2",
      actualValue: d2Enabled,
      satisfied: !d2Enabled,
      reason: d2Enabled
        ? "D2 已开启，服务令牌权限已收紧，请求被拒绝"
        : "D2 未开启，服务令牌权限未收紧"
    }
  ];

  const b2Rejected = !oOpen;
  const b5Rejected = !tGranted || d2Enabled;

  const arrivalNodeId: NodeId = b4.sensitiveArrival ?? b4.to;

  const events: PathEvent[] = [
    {
      eventIndex: 3,
      pathId: "B",
      stepId: "B1",
      fromNodeId: b1.from,
      toNodeId: b1.to,
      outcome: "passed",
      conditionChecks: []
    },
    {
      eventIndex: 4,
      pathId: "B",
      stepId: "B2",
      fromNodeId: b2.from,
      toNodeId: b2.to,
      outcome: b2Rejected ? "rejected" : "passed",
      conditionChecks: [b2Check]
    },
    {
      eventIndex: 5,
      pathId: "B",
      stepId: "B3",
      fromNodeId: b3.from,
      toNodeId: b3.to,
      outcome: b2Rejected ? "skipped" : "passed",
      conditionChecks: []
    },
    {
      eventIndex: 6,
      pathId: "B",
      stepId: "B4",
      fromNodeId: b4.from,
      toNodeId: b4.to,
      outcome: b2Rejected ? "skipped" : "passed",
      conditionChecks: [],
      ...(!b2Rejected && d3Enabled
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
      eventIndex: 7,
      pathId: "B",
      stepId: "B5",
      fromNodeId: b5.from,
      toNodeId: b5.to,
      outcome: b2Rejected ? "skipped" : b5Rejected ? "rejected" : "data-arrived",
      conditionChecks: b2Rejected ? [] : b5Checks
    }
  ];

  const pathResult: PathResult = b2Rejected
    ? {
        pathId: "B",
        outcome: "blocked",
        firstBlockedStepId: "B2",
        blockedReason: b2Check.reason
      }
    : b5Rejected
      ? {
          pathId: "B",
          outcome: "blocked",
          firstBlockedStepId: "B5",
          blockedReason: b5Checks
            .filter((check) => !check.satisfied)
            .map((check) => check.reason)
            .join("；")
        }
      : { pathId: "B", outcome: "reached" };

  return { events, pathResult };
}
