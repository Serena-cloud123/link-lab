import { isDeepStrictEqual } from "node:util";
import type {
  RunRecord,
  RunResult,
  Scenario,
  VerifyRunResponse
} from "@link-lab/contracts";
import { evaluateRun } from "@link-lab/engine";

/** 生成供前端展示的差异摘要；只读，不写库。 */
function summarizeDifferences(stored: RunResult, recomputed: RunResult): string[] {
  const differences: string[] = [];

  if (stored.events.length !== recomputed.events.length) {
    differences.push(
      `事件数量不一致：快照 ${stored.events.length} 条 · 重算 ${recomputed.events.length} 条`
    );
  }

  const sharedCount = Math.min(stored.events.length, recomputed.events.length);
  for (let i = 0; i < sharedCount; i += 1) {
    if (!isDeepStrictEqual(stored.events[i], recomputed.events[i])) {
      differences.push(
        `事件 #${i} 不一致（路径 ${stored.events[i].pathId} · ${stored.events[i].stepId}）`
      );
      // 只列第一条差异事件，避免摘要过长
      break;
    }
  }

  if (!isDeepStrictEqual(stored.pathResults, recomputed.pathResults)) {
    differences.push("路径结论不一致");
  }

  if (stored.alertCount !== recomputed.alertCount) {
    differences.push(
      `告警数量不一致：快照 ${stored.alertCount} 条 · 重算 ${recomputed.alertCount} 条`
    );
  }

  if (differences.length === 0) {
    differences.push("结果存在字段级差异");
  }

  return differences;
}

/**
 * 显式版本核对：只读。
 * 版本不一致直接返回 version-mismatch，绝不调用 evaluateRun；
 * 同版本才重算，并用 isDeepStrictEqual 与快照深度比较。
 */
export function verifyRunRecord(
  scenario: Scenario,
  record: RunRecord
): VerifyRunResponse {
  const versions = {
    recordScenarioId: record.scenarioId,
    recordScenarioVersion: record.scenarioVersion,
    currentScenarioId: scenario.id,
    currentScenarioVersion: scenario.version
  };

  if (
    record.scenarioId !== scenario.id ||
    record.scenarioVersion !== scenario.version
  ) {
    return { status: "version-mismatch", ...versions };
  }

  const recomputed = evaluateRun(scenario, record.input);

  if (!isDeepStrictEqual(recomputed, record.result)) {
    return {
      status: "result-mismatch",
      ...versions,
      differences: summarizeDifferences(record.result, recomputed)
    };
  }

  return { status: "match", ...versions };
}
