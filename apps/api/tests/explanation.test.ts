import { describe, expect, it } from "vitest";
import type { RunResult } from "@link-lab/contracts";
import {
  EXPLANATION_SOURCE,
  EXPLANATION_VERSION,
  buildRunExplanation
} from "../src/explanation";

function makeResult(
  pathResults: RunResult["pathResults"],
  alertCount: number
): RunResult {
  return { events: [], pathResults, alertCount };
}

describe("规则模板解释", () => {
  it("两路均阻断时逐条写出 firstBlockedStepId 与引擎原样 blockedReason", () => {
    const result = makeResult(
      [
        {
          pathId: "A",
          outcome: "blocked",
          firstBlockedStepId: "A3",
          blockedReason: "D1 已开启，管理导出接口拒绝请求"
        },
        {
          pathId: "B",
          outcome: "blocked",
          firstBlockedStepId: "B2",
          blockedReason: "诊断页面对普通账号关闭，访问被拒绝"
        }
      ],
      0
    );

    expect(buildRunExplanation(result)).toBe(
      "两条已建模路径均未到达模拟数据：路径 A 在 A3 被阻断（D1 已开启，管理导出接口拒绝请求）；路径 B 在 B2 被阻断（诊断页面对普通账号关闭，访问被拒绝）；本次未产生告警。"
    );
    expect(buildRunExplanation(result)).not.toContain("系统安全");
  });

  it("A 阻断、B 到达时保留 A 的阻断原因，并说明 B 仍到达", () => {
    const result = makeResult(
      [
        {
          pathId: "A",
          outcome: "blocked",
          firstBlockedStepId: "A3",
          blockedReason: "D1 已开启，管理导出接口拒绝请求"
        },
        { pathId: "B", outcome: "reached" }
      ],
      2
    );

    expect(buildRunExplanation(result)).toBe(
      "路径 A 在 A3 被阻断（D1 已开启，管理导出接口拒绝请求），但路径 B 仍到达模拟数据；本次 D3 记录了 2 条敏感请求告警，但未自动阻断。"
    );
  });

  it("B 阻断、A 到达时保留 B 的阻断原因，并说明 A 仍到达", () => {
    const result = makeResult(
      [
        { pathId: "A", outcome: "reached" },
        {
          pathId: "B",
          outcome: "blocked",
          firstBlockedStepId: "B5",
          blockedReason:
            "服务令牌无报名明细读取权限，请求被拒绝；D2 已开启，服务令牌权限已收紧，请求被拒绝"
        }
      ],
      1
    );

    expect(buildRunExplanation(result)).toBe(
      "路径 B 在 B5 被阻断（服务令牌无报名明细读取权限，请求被拒绝；D2 已开启，服务令牌权限已收紧，请求被拒绝），但路径 A 仍到达模拟数据；本次 D3 记录了 1 条敏感请求告警，但未自动阻断。"
    );
  });

  it("两路均到达时不写阻断结论，也不写系统安全", () => {
    const result = makeResult(
      [
        { pathId: "A", outcome: "reached" },
        { pathId: "B", outcome: "reached" }
      ],
      0
    );

    const explanation = buildRunExplanation(result);
    expect(explanation).toBe(
      "两条已建模路径均到达模拟数据，当前配置未阻断任何已建模路径；本次未产生告警。"
    );
    expect(explanation).not.toContain("系统安全");
  });

  it("解释来源与版本固定为规则模板", () => {
    expect(EXPLANATION_SOURCE).toBe("template");
    expect(EXPLANATION_VERSION).toBe(1);
  });

  it("相同 RunResult 重复调用得到同一句解释", () => {
    const result = makeResult(
      [
        { pathId: "A", outcome: "reached" },
        {
          pathId: "B",
          outcome: "blocked",
          firstBlockedStepId: "B2",
          blockedReason: "诊断页面对普通账号关闭，访问被拒绝"
        }
      ],
      1
    );
    expect(buildRunExplanation(result)).toBe(buildRunExplanation(result));
  });
});
