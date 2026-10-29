import type { RunInput, RunResult, Scenario } from "@link-lab/contracts";
import { evaluatePathA } from "./pathA.js";
import { evaluatePathB } from "./pathB.js";

/**
 * 组合路径 A 与路径 B 的评估结果，输出完整 RunResult。
 * 复用 evaluatePathA 与 evaluatePathB，不复制两条路径的规则。
 * eventIndex 保持 A 路径 0..2 后接 B 路径 3..7，不重新编号。
 */
export function evaluateRun(scenario: Scenario, input: RunInput): RunResult {
  if (input.scenarioId !== scenario.id) {
    throw new Error(
      `场景 id 不匹配：输入 ${input.scenarioId}，场景 ${scenario.id}`
    );
  }

  const pathA = evaluatePathA(scenario, input);
  const pathB = evaluatePathB(scenario, input);

  const events = [...pathA.events, ...pathB.events];
  const pathResults = [pathA.pathResult, pathB.pathResult];
  const alertCount = events.filter((event) => event.alert).length;

  return { events, pathResults, alertCount };
}
