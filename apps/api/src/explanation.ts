import type { PathResult, RunResult } from "@link-lab/contracts";

export const EXPLANATION_SOURCE = "template" as const;
export const EXPLANATION_VERSION = 1;

function blockedSentence(pathResult: PathResult): string {
  if (!pathResult.firstBlockedStepId || !pathResult.blockedReason) {
    throw new Error(`路径 ${pathResult.pathId} 的阻断信息不完整`);
  }
  return `路径 ${pathResult.pathId} 在 ${pathResult.firstBlockedStepId} 被阻断（${pathResult.blockedReason}）`;
}

function alertClause(alertCount: number): string {
  return alertCount > 0
    ? `本次 D3 记录了 ${alertCount} 条敏感请求告警，但未自动阻断。`
    : "本次未产生告警。";
}

/**
 * 纯函数：只依据服务器已重算的 RunResult 输出一句中文规则模板。
 * 不读取输入、不调用外部模型、不引入随机数或时间。
 */
export function buildRunExplanation(result: RunResult): string {
  const pathA = result.pathResults.find((item) => item.pathId === "A");
  const pathB = result.pathResults.find((item) => item.pathId === "B");
  if (!pathA || !pathB) {
    throw new Error("RunResult 缺少已建模路径 A 或 B");
  }

  let body: string;
  if (pathA.outcome === "blocked" && pathB.outcome === "blocked") {
    body = `两条已建模路径均未到达模拟数据：${blockedSentence(pathA)}；${blockedSentence(pathB)}`;
  } else if (pathA.outcome === "blocked") {
    body = `${blockedSentence(pathA)}，但路径 B 仍到达模拟数据`;
  } else if (pathB.outcome === "blocked") {
    body = `${blockedSentence(pathB)}，但路径 A 仍到达模拟数据`;
  } else {
    body = "两条已建模路径均到达模拟数据，当前配置未阻断任何已建模路径";
  }

  return `${body}；${alertClause(result.alertCount)}`;
}
