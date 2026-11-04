import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RunInput, RunRecord, RunResult, Scenario } from "@link-lab/contracts";
import App from "../src/App";

vi.mock("../src/api", () => ({
  fetchScenario: vi.fn(),
  postEvaluation: vi.fn(),
  saveRun: vi.fn()
}));

import { fetchScenario, postEvaluation, saveRun } from "../src/api";

type MockFn = ReturnType<typeof vi.fn>;
const fetchScenarioMock = fetchScenario as unknown as MockFn;
const postEvaluationMock = postEvaluation as unknown as MockFn;
const saveRunMock = saveRun as unknown as MockFn;

const scenarioFixture: Scenario = {
  id: "campus-registration",
  version: 1,
  title: "校园活动报名数据泄露（虚构）",
  boundary: "边界说明",
  nodes: [
    { id: "N1", label: "普通账号", description: "", canvasX: 0, canvasY: 0 },
    { id: "N2", label: "报名应用", description: "", canvasX: 0, canvasY: 0 },
    { id: "N3", label: "管理导出接口", description: "", canvasX: 0, canvasY: 0 },
    { id: "N4", label: "诊断页面", description: "", canvasX: 0, canvasY: 0 },
    { id: "N5", label: "服务令牌", description: "", canvasX: 0, canvasY: 0 },
    { id: "N6", label: "数据服务", description: "", canvasX: 0, canvasY: 0 },
    { id: "N7", label: "报名明细", description: "", canvasX: 0, canvasY: 0 }
  ],
  paths: [
    {
      id: "A",
      label: "路径 A",
      steps: [
        { id: "A1", from: "N1", to: "N2" },
        { id: "A2", from: "N2", to: "N3" },
        { id: "A3", from: "N3", to: "N7", barrier: "D1" }
      ]
    },
    {
      id: "B",
      label: "路径 B",
      steps: [
        { id: "B1", from: "N1", to: "N2" },
        { id: "B2", from: "N2", to: "N4", condition: "O" },
        { id: "B3", from: "N4", to: "N5" },
        { id: "B4", from: "N5", to: "N6" },
        { id: "B5", from: "N6", to: "N7", condition: "T", barrier: "D2" }
      ]
    }
  ],
  initialConditions: {
    O: { label: "诊断页面对普通账号开放", options: ["open", "closed"] },
    T: { label: "服务令牌持有报名明细读取权限", options: ["granted", "revoked"] }
  },
  defenses: {
    D1: { label: "修复管理导出接口权限检查", blocksPath: "A" },
    D2: { label: "收紧服务令牌权限", blocksPath: "B" },
    D3: { label: "记录到达敏感接口的请求", alerts: true }
  },
  presets: [
    { id: "A", label: "预设 A：O 开 T 有", conditions: { O: "open", T: "granted" } },
    { id: "B", label: "预设 B：O 关 T 有", conditions: { O: "closed", T: "granted" } },
    { id: "C", label: "预设 C：O 开 T 无", conditions: { O: "open", T: "revoked" } }
  ]
};

const okResult: RunResult = { events: [], pathResults: [], alertCount: 0 };

const baselineInputFixture: RunInput = {
  scenarioId: "campus-registration",
  presetId: "A",
  conditions: { O: "open", T: "granted" },
  defenses: []
};

/** 测试用返回值：模拟引擎生成的 8 条事件，避免前端自己发明规则。 */
function makeResult(input: RunInput): RunResult {
  const hasD1 = input.defenses.includes("D1");
  const hasD2 = input.defenses.includes("D2");
  const hasD3 = input.defenses.includes("D3");
  const oOpen = input.conditions.O === "open";
  const tGranted = input.conditions.T === "granted";
  const b2Rejected = !oOpen;
  const b5Rejected = !tGranted || hasD2;

  const d1Reason = hasD1
    ? "D1 已开启，管理导出接口拒绝请求"
    : "D1 未开启，请求继续前往报名明细";

  const b2Reason = oOpen
    ? "诊断页面对普通账号开放，可继续访问"
    : "诊断页面对普通账号关闭，访问被拒绝";

  const tReason = tGranted
    ? "服务令牌持有报名明细读取权限"
    : "服务令牌无报名明细读取权限，请求被拒绝";
  const d2Reason = hasD2
    ? "D2 已开启，服务令牌权限已收紧，请求被拒绝"
    : "D2 未开启，服务令牌权限未收紧";

  return {
    events: [
      {
        eventIndex: 0, pathId: "A", stepId: "A1",
        fromNodeId: "N1", toNodeId: "N2", outcome: "passed", conditionChecks: []
      },
      {
        eventIndex: 1, pathId: "A", stepId: "A2",
        fromNodeId: "N2", toNodeId: "N3", outcome: "passed", conditionChecks: [],
        ...(hasD3 ? { alert: { defenseId: "D3" as const, interfaceNodeId: "N3" as const, reason: "请求到达敏感接口 N3，D3 已记录告警" } } : {})
      },
      {
        eventIndex: 2, pathId: "A", stepId: "A3",
        fromNodeId: "N3", toNodeId: "N7",
        outcome: hasD1 ? "rejected" : "data-arrived",
        conditionChecks: [{ id: "D1", actualValue: hasD1, satisfied: !hasD1, reason: d1Reason }]
      },
      {
        eventIndex: 3, pathId: "B", stepId: "B1",
        fromNodeId: "N1", toNodeId: "N2", outcome: "passed", conditionChecks: []
      },
      {
        eventIndex: 4, pathId: "B", stepId: "B2",
        fromNodeId: "N2", toNodeId: "N4",
        outcome: b2Rejected ? "rejected" : "passed",
        conditionChecks: [{ id: "O", actualValue: input.conditions.O, satisfied: oOpen, reason: b2Reason }]
      },
      {
        eventIndex: 5, pathId: "B", stepId: "B3",
        fromNodeId: "N4", toNodeId: "N5",
        outcome: b2Rejected ? "skipped" : "passed", conditionChecks: []
      },
      {
        eventIndex: 6, pathId: "B", stepId: "B4",
        fromNodeId: "N5", toNodeId: "N6",
        outcome: b2Rejected ? "skipped" : "passed",
        conditionChecks: [],
        ...(!b2Rejected && hasD3 ? { alert: { defenseId: "D3" as const, interfaceNodeId: "N6" as const, reason: "请求到达敏感接口 N6，D3 已记录告警" } } : {})
      },
      {
        eventIndex: 7, pathId: "B", stepId: "B5",
        fromNodeId: "N6", toNodeId: "N7",
        outcome: b2Rejected ? "skipped" : b5Rejected ? "rejected" : "data-arrived",
        conditionChecks: b2Rejected ? [] : [
          { id: "T", actualValue: input.conditions.T, satisfied: tGranted, reason: tReason },
          { id: "D2", actualValue: hasD2, satisfied: !hasD2, reason: d2Reason }
        ]
      }
    ],
    pathResults: [
      hasD1
        ? { pathId: "A" as const, outcome: "blocked" as const, firstBlockedStepId: "A3" as const, blockedReason: d1Reason }
        : { pathId: "A" as const, outcome: "reached" as const },
      b2Rejected
        ? { pathId: "B" as const, outcome: "blocked" as const, firstBlockedStepId: "B2" as const, blockedReason: b2Reason }
        : b5Rejected
          ? {
              pathId: "B" as const, outcome: "blocked" as const, firstBlockedStepId: "B5" as const,
              blockedReason: [
                ...(tGranted ? [] : [tReason]),
                ...(hasD2 ? [d2Reason] : [])
              ].join("；")
            }
          : { pathId: "B" as const, outcome: "reached" as const }
    ],
    alertCount: hasD3 ? (oOpen ? 2 : 1) : 0
  };
}

/** 模拟服务器保存成功的返回：id/savedAt/解释均来自响应，不由前端生成。 */
function makeSavedRecord(input: RunInput): RunRecord {
  return {
    id: "record-fixed-id-001",
    savedAt: "2026-11-04T10:20:30.000Z",
    scenarioId: input.scenarioId,
    scenarioVersion: 1,
    input,
    result: makeResult(input),
    explanation:
      "路径 A 在 A3 被阻断（D1 已开启，管理导出接口拒绝请求），但路径 B 仍到达模拟数据；本次未产生告警。",
    explanationSource: "template",
    explanationVersion: 1
  };
}

async function renderWorkbench() {
  render(<App />);
  await screen.findByText("进入沙盘工作台");
  fireEvent.click(screen.getByText("进入沙盘工作台"));
  await screen.findByLabelText("运行配置");
}

function getOSlider(): HTMLInputElement {
  return screen.getByLabelText(/诊断页面对普通账号开放/) as HTMLInputElement;
}

function getDefenseButton(id: "D1" | "D2" | "D3"): HTMLElement {
  return screen.getByRole("button", { name: new RegExp(id) });
}

const COMPARISON_TITLE = "同条件对比：无防御基线 → 当前防御运行";

describe("App 工作台交互", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    fetchScenarioMock.mockResolvedValue(scenarioFixture);
    postEvaluationMock.mockResolvedValue(okResult);
    saveRunMock.mockImplementation((input: RunInput) =>
      Promise.resolve(makeSavedRecord(input))
    );
  });

  it("拖动滑块（input）不提交", async () => {
    await renderWorkbench();
    const oSlider = getOSlider();
    fireEvent.input(oSlider, { target: { value: "1" } });
    expect(postEvaluationMock).not.toHaveBeenCalled();
  });

  it("拖动后 mouseUp 提交一次，O=closed", async () => {
    await renderWorkbench();
    const oSlider = getOSlider();
    fireEvent.input(oSlider, { target: { value: "1" } });
    fireEvent.mouseUp(oSlider);
    expect(postEvaluationMock).toHaveBeenCalledTimes(1);
    const input = postEvaluationMock.mock.calls[0][0] as RunInput;
    expect(input.conditions.O).toBe("closed");
  });

  it("拖到新值再拖回原位，mouseUp 不提交", async () => {
    await renderWorkbench();
    const oSlider = getOSlider();
    fireEvent.input(oSlider, { target: { value: "1" } });
    fireEvent.input(oSlider, { target: { value: "0" } });
    fireEvent.mouseUp(oSlider);
    expect(postEvaluationMock).not.toHaveBeenCalled();
  });

  it("mouseUp 后再 blur 只提交一次（去重）", async () => {
    await renderWorkbench();
    const oSlider = getOSlider();
    fireEvent.input(oSlider, { target: { value: "1" } });
    fireEvent.mouseUp(oSlider);
    fireEvent.blur(oSlider);
    expect(postEvaluationMock).toHaveBeenCalledTimes(1);
  });

  it("点击 D1 提交一次，defenses=['D1']", async () => {
    await renderWorkbench();
    const d1 = getDefenseButton("D1");
    fireEvent.click(d1);
    expect(postEvaluationMock).toHaveBeenCalledTimes(1);
    const input = postEvaluationMock.mock.calls[0][0] as RunInput;
    expect(input.defenses).toEqual(["D1"]);
  });

  it("D3 标签为记录告警，不显示阻断", async () => {
    await renderWorkbench();
    const d3 = getDefenseButton("D3");
    expect(d3).toHaveTextContent("记录告警");
    expect(d3).not.toHaveTextContent("阻断");
  });

  it("运行中（永不 resolve）点击 D2 与拖动滑块均不产生新提交", async () => {
    await renderWorkbench();
    postEvaluationMock.mockReturnValue(new Promise(() => {}));
    fireEvent.click(getDefenseButton("D1"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "正在运行…" })).toBeInTheDocument()
    );
    expect(postEvaluationMock).toHaveBeenCalledTimes(1);
    fireEvent.click(getDefenseButton("D2"));
    const oSlider = getOSlider();
    fireEvent.input(oSlider, { target: { value: "1" } });
    fireEvent.mouseUp(oSlider);
    expect(postEvaluationMock).toHaveBeenCalledTimes(1);
  });

  it("切换预设后结果清空且不自动提交", async () => {
    await renderWorkbench();
    fireEvent.click(getDefenseButton("D1"));
    await screen.findByText("路径结果");
    expect(postEvaluationMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("预设 B：O 关 T 有"));
    expect(postEvaluationMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/尚未运行/)).toBeInTheDocument();
  });

  it("同条件下显示基线 vs 当前对比", async () => {
    postEvaluationMock.mockImplementation((input: RunInput) =>
      Promise.resolve(makeResult(input))
    );
    await renderWorkbench();
    fireEvent.click(screen.getByRole("button", { name: "运行当前配置" }));
    await screen.findByText(/当前运行即为无防御基线/);
    expect(screen.queryByText(COMPARISON_TITLE)).not.toBeInTheDocument();
    fireEvent.click(getDefenseButton("D1"));
    await screen.findByText(COMPARISON_TITLE);
    expect(screen.getByText("由到达变为阻断")).toBeInTheDocument();
    expect(screen.getByText("保持到达")).toBeInTheDocument();
  });

  it("O 变化使对比失效", async () => {
    postEvaluationMock.mockImplementation((input: RunInput) =>
      Promise.resolve(makeResult(input))
    );
    await renderWorkbench();
    fireEvent.click(screen.getByRole("button", { name: "运行当前配置" }));
    await screen.findByText(/当前运行即为无防御基线/);
    fireEvent.click(getDefenseButton("D1"));
    await screen.findByText(COMPARISON_TITLE);
    const oSlider = getOSlider();
    fireEvent.input(oSlider, { target: { value: "1" } });
    fireEvent.mouseUp(oSlider);
    await waitFor(() =>
      expect(screen.queryByText(COMPARISON_TITLE)).not.toBeInTheDocument()
    );
  });

  it("补跑基线不修改当前防御与干预结果，且只发一次请求", async () => {
    postEvaluationMock.mockImplementation((input: RunInput) =>
      Promise.resolve(makeResult(input))
    );
    await renderWorkbench();
    fireEvent.click(getDefenseButton("D1"));
    await screen.findByText(/当前 O\/T 尚无无防御基线/);
    const callsBefore = postEvaluationMock.mock.calls.length;
    fireEvent.click(
      screen.getByRole("button", { name: "运行当前条件的无防御基线" })
    );
    await screen.findByText(COMPARISON_TITLE);
    expect(postEvaluationMock.mock.calls.length).toBe(callsBefore + 1);
    const baselineCall = postEvaluationMock.mock.calls[callsBefore][0] as RunInput;
    expect(baselineCall.defenses).toEqual([]);
    expect(getDefenseButton("D1")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("由到达变为阻断")).toBeInTheDocument();
  });

  it("过期基线响应不能恢复旧对比", async () => {
    let resolveBaseline: ((result: RunResult) => void) | undefined;
    postEvaluationMock.mockImplementation((input: RunInput) => {
      if (input.defenses.length === 0) {
        return new Promise<RunResult>((resolve) => {
          resolveBaseline = resolve;
        });
      }
      return Promise.resolve(makeResult(input));
    });
    await renderWorkbench();
    fireEvent.click(getDefenseButton("D1"));
    await screen.findByText(/当前 O\/T 尚无无防御基线/);
    fireEvent.click(
      screen.getByRole("button", { name: "运行当前条件的无防御基线" })
    );
    const oSlider = getOSlider();
    fireEvent.input(oSlider, { target: { value: "1" } });
    fireEvent.mouseUp(oSlider);
    await act(async () => {
      resolveBaseline?.(makeResult(baselineInputFixture));
    });
    await waitFor(() =>
      expect(screen.queryByText(COMPARISON_TITLE)).not.toBeInTheDocument()
    );
  });

  it("切换预设使基线失效且不额外发请求", async () => {
    postEvaluationMock.mockImplementation((input: RunInput) =>
      Promise.resolve(makeResult(input))
    );
    await renderWorkbench();
    fireEvent.click(screen.getByRole("button", { name: "运行当前配置" }));
    await screen.findByText(/当前运行即为无防御基线/);
    fireEvent.click(getDefenseButton("D1"));
    await screen.findByText(COMPARISON_TITLE);
    const callsBefore = postEvaluationMock.mock.calls.length;
    fireEvent.click(screen.getByText("预设 B：O 关 T 有"));
    await waitFor(() =>
      expect(screen.queryByText(COMPARISON_TITLE)).not.toBeInTheDocument()
    );
    expect(postEvaluationMock.mock.calls.length).toBe(callsBefore);
    expect(document.querySelectorAll(".defense-toggle.active").length).toBe(0);
    expect(screen.getByText(/尚未运行/)).toBeInTheDocument();
  });

  // ===== Day 11 A 新增 =====

  it("新结果从下标 0 开始，显示 A1；跳到 3 显示 B1；二者共用物理边但区分 stepId", async () => {
    postEvaluationMock.mockImplementation((input: RunInput) =>
      Promise.resolve(makeResult(input))
    );
    await renderWorkbench();
    fireEvent.click(screen.getByRole("button", { name: "运行当前配置" }));
    await screen.findByText(/当前运行即为无防御基线/);

    // 0 下标锚定 A1（图下固定一行）
    expect(screen.getByText(/当前事件：路径 A · A1/)).toBeInTheDocument();
    expect(screen.queryByText(/当前事件：路径 B · B1/)).not.toBeInTheDocument();

    // 跳 3 下标锚定 B1
    fireEvent.click(screen.getByRole("button", { name: "跳转到事件 3" }));
    await waitFor(() =>
      expect(screen.getByText(/当前事件：路径 B · B1/)).toBeInTheDocument()
    );
    expect(screen.queryByText(/当前事件：路径 A · A1/)).not.toBeInTheDocument();
  });

  it("边界：下标 0 上一步禁用，下标 7 下一步禁用", async () => {
    postEvaluationMock.mockImplementation((input: RunInput) =>
      Promise.resolve(makeResult(input))
    );
    await renderWorkbench();
    fireEvent.click(screen.getByRole("button", { name: "运行当前配置" }));
    await screen.findByText(/当前运行即为无防御基线/);

    const prev = screen.getByRole("button", { name: "上一步" });
    const next = screen.getByRole("button", { name: "下一步" });
    expect(prev).toBeDisabled();
    expect(next).not.toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "跳转到事件 7" }));
    await waitFor(() => expect(next).toBeDisabled());
    expect(prev).not.toBeDisabled();
  });

  it("D1 开启：跳到下标 2，A3 显示已拒绝 + D1 未满足理由（来自引擎原样 reason）", async () => {
    postEvaluationMock.mockImplementation((input: RunInput) =>
      Promise.resolve(makeResult(input))
    );
    await renderWorkbench();
    fireEvent.click(getDefenseButton("D1"));
    await screen.findByText(/路径 B 仍到达模拟数据/);

    // 取引擎原样 reason 做断言
    const call = postEvaluationMock.mock.calls.find(
      (c) => Array.isArray(c) && (c[0] as RunInput).defenses.includes("D1")
    )?.[0] as RunInput;
    const expected = makeResult(call).events[2].conditionChecks[0].reason;

    fireEvent.click(screen.getByRole("button", { name: "跳转到事件 2" }));
    await waitFor(() => {
      // 图下固定锚定 + 当前事件面板 outcome 标签（两处都有，用 getAllByText）
      const anchors = screen.getAllByText(/当前事件：路径 A · A3/);
      expect(anchors.length).toBeGreaterThan(0);
      const rejectedLabels = screen.getAllByText(/已拒绝/);
      expect(rejectedLabels.length).toBeGreaterThan(0);
      // 理由原样出现（可能在 CurrentEventPanel 条件检查 + RunResultPanel 事件列表）
      expect(screen.getAllByText(new RegExp(expected)).length).toBeGreaterThan(0);
    });
  });

  it("O 关闭 + D3：跳到 4/5/6/7 → B2 已拒绝，B3-B5 未执行，B4 无告警", async () => {
    postEvaluationMock.mockImplementation((input: RunInput) =>
      Promise.resolve(makeResult(input))
    );
    await renderWorkbench();
    fireEvent.click(screen.getByText("预设 B：O 关 T 有"));
    fireEvent.click(getDefenseButton("D3"));
    await waitFor(() => {
      // 运行后路径结果面板会出现路径 A / 路径 B 文字（两处来源），等事件列表出现
      expect(
        screen.queryByText(/暂无事件/)
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "跳转到事件 7" })
      ).toBeInTheDocument();
    });

    // 跳到 4：B2 已拒绝
    fireEvent.click(screen.getByRole("button", { name: "跳转到事件 4" }));
    await waitFor(() => {
      expect(
        screen.getAllByText(/当前事件：路径 B · B2/).length
      ).toBeGreaterThan(0);
      // outcome 标签有「已拒绝」
      expect(screen.getAllByText(/已拒绝/).length).toBeGreaterThan(0);
    });

    // 跳到 5、6、7 都显示「未执行」
    for (const idx of [5, 6, 7]) {
      fireEvent.click(screen.getByRole("button", { name: `跳转到事件 ${idx}` }));
      await waitFor(() =>
        expect(screen.getAllByText(/未执行/).length).toBeGreaterThan(0)
      );
    }

    // B4 在 B2 被拒后是 skipped，即使有 D3 也不会出现 alert 文案
    expect(
      screen.queryByText("检测到敏感请求，未自动阻断")
    ).not.toBeInTheDocument();
  });

  it("无 D1 跳到 2：A3 显示数据到达 + 报名明细已到达", async () => {
    postEvaluationMock.mockImplementation((input: RunInput) =>
      Promise.resolve(makeResult(input))
    );
    await renderWorkbench();
    fireEvent.click(screen.getByRole("button", { name: "运行当前配置" }));
    await screen.findByText(/当前运行即为无防御基线/);
    fireEvent.click(screen.getByRole("button", { name: "跳转到事件 2" }));
    await waitFor(() => {
      expect(
        screen.getAllByText(/当前事件：路径 A · A3/).length
      ).toBeGreaterThan(0);
      expect(
        screen.getAllByText(/报名明细已到达（模拟）/).length
      ).toBeGreaterThan(0);
    });
  });

  it("残余路径：A blocked + B reached 引用 B2/B5 原样 reason；两路 blocked 时纯函数层只输出总述且无「系统已安全」", async () => {
    postEvaluationMock.mockImplementation((input: RunInput) =>
      Promise.resolve(makeResult(input))
    );
    await renderWorkbench();

    // 跑 D1：A blocked, B reached → 验证 B 仍到达的依据原样引用引擎 reason
    fireEvent.click(getDefenseButton("D1"));
    await screen.findByText(/路径 B 仍到达模拟数据/);
    const call = postEvaluationMock.mock.calls.find(
      (c) => Array.isArray(c) && (c[0] as RunInput).defenses.includes("D1")
    )?.[0] as RunInput;
    const r = makeResult(call);
    const b2Reason = r.events[4].conditionChecks[0].reason;
    const b5Reasons = r.events[7].conditionChecks.map((c) => c.reason);
    expect(screen.getAllByText(new RegExp(b2Reason)).length).toBeGreaterThan(0);
    for (const reason of b5Reasons) {
      expect(screen.getAllByText(new RegExp(reason)).length).toBeGreaterThan(0);
    }
    expect(screen.queryByText(/系统已安全/)).not.toBeInTheDocument();
  });

  it("下标变化、上一步、下一步、跳转、播放都不触发 postEvaluation", async () => {
    postEvaluationMock.mockImplementation((input: RunInput) =>
      Promise.resolve(makeResult(input))
    );
    await renderWorkbench();
    fireEvent.click(getDefenseButton("D1"));
    await screen.findByText(/路径 B 仍到达模拟数据/);
    const callsBefore = postEvaluationMock.mock.calls.length;

    // 上一步、下一步、跳转 7 全部不发请求
    fireEvent.click(screen.getByRole("button", { name: "上一步" }));
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    fireEvent.click(screen.getByRole("button", { name: "跳转到事件 4" }));
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    fireEvent.click(screen.getByRole("button", { name: "跳转到事件 7" }));
    expect(postEvaluationMock.mock.calls.length).toBe(callsBefore);

    // 播放（800ms 会自动推进一次）也不发请求
    fireEvent.click(screen.getByRole("button", { name: "播放" }));
    // 让它跑过一次自动推进
    await act(async () => {
      await new Promise((r) => setTimeout(r, 900));
    });
    expect(postEvaluationMock.mock.calls.length).toBe(callsBefore);
  });

  it("重置：跳到中间后切换防御 → 下标回到 0；切预设 → 播放条禁用", async () => {
    postEvaluationMock.mockImplementation((input: RunInput) =>
      Promise.resolve(makeResult(input))
    );
    await renderWorkbench();
    fireEvent.click(getDefenseButton("D1"));
    await screen.findByText(/路径 B 仍到达模拟数据/);
    fireEvent.click(screen.getByRole("button", { name: "跳转到事件 6" }));
    await waitFor(() =>
      expect(screen.getByText(/当前事件：路径 B · B4/)).toBeInTheDocument()
    );

    // 关 D1 再重跑（toggleDefense 触发 run）
    fireEvent.click(getDefenseButton("D1"));
    await screen.findByText(/当前运行即为无防御基线/);
    await waitFor(() =>
      expect(screen.getByText(/当前事件：路径 A · A1/)).toBeInTheDocument()
    );
    expect(
      screen.queryByText(/当前事件：路径 B · B4/)
    ).not.toBeInTheDocument();

    // 切预设 → runState 回到 idle → 播放条显示「暂无事件」
    fireEvent.click(screen.getByText("预设 B：O 关 T 有"));
    await waitFor(() =>
      expect(screen.getByText(/暂无事件/)).toBeInTheDocument()
    );
  });

  it("播放到末尾自动暂停", async () => {
    postEvaluationMock.mockImplementation((input: RunInput) =>
      Promise.resolve(makeResult(input))
    );
    await renderWorkbench();
    fireEvent.click(getDefenseButton("D1"));
    await screen.findByText(/路径 B 仍到达模拟数据/);

    // 跳到 6，点播放 → 自动推进到 7，然后自动停
    fireEvent.click(screen.getByRole("button", { name: "跳转到事件 6" }));
    fireEvent.click(screen.getByRole("button", { name: "播放" }));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1700));
    });
    expect(
      screen.getByRole("button", { name: "播放" })
    ).toBeInTheDocument();
  });

  // ===== Day 11 B 新增 =====

  it("关闭动画后主状态（文字、徽标、残余路径）完整可读", async () => {
    postEvaluationMock.mockImplementation((input: RunInput) =>
      Promise.resolve(makeResult(input))
    );
    await renderWorkbench();
    fireEvent.click(getDefenseButton("D1"));
    await screen.findByText(/路径 B 仍到达模拟数据/);

    // 确保动画当前处于开启态（先按标题找按钮；aria-label 是 "关闭动画"/"开启动画"）
    const animBtn = screen.getByRole("button", { name: /动画/ });
    if (animBtn.getAttribute("aria-pressed") === "false") {
      fireEvent.click(animBtn);
    }
    // 再关一次：此时必为 "关闭动画" aria-label（即关状态）
    fireEvent.click(screen.getByRole("button", { name: "关闭动画" }));

    // 静态状态全部完整可读（CSS keyframes 只是视觉层；DOM + 文字不受影响）
    expect(screen.getByText(/当前事件：路径 A · A1/)).toBeInTheDocument();
    expect(
      screen.getByText(/路径 B 仍到达模拟数据/)
    ).toBeInTheDocument();

    // B 仍到达的依据（引擎原样 reason）仍在
    const call = postEvaluationMock.mock.calls.find(
      (c) => Array.isArray(c) && (c[0] as RunInput).defenses.includes("D1")
    )?.[0] as RunInput;
    const r = makeResult(call);
    const b2Reason = r.events[4].conditionChecks[0].reason;
    expect(screen.getAllByText(new RegExp(b2Reason)).length).toBeGreaterThan(0);
  });

  it("prefers-reduced-motion: reduce 时动效默认关闭", async () => {
    // 清空 localStorage，让 animationsEnabled 初始值完全依赖 matchMedia
    try {
      window.localStorage.removeItem("animationsEnabled");
    } catch {
      // 隐私模式忽略
    }
    // 必须在任何组件渲染前替换 matchMedia；否则 useState 的 initializer 已经跑了。
    const origMatchMedia = window.matchMedia;
    const mockMedia = {
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null
    } as unknown as MediaQueryList;
    window.matchMedia = vi.fn().mockReturnValue(mockMedia);
    try {
      render(<App />);
      await screen.findByText("进入沙盘工作台");
      fireEvent.click(screen.getByText("进入沙盘工作台"));
      await screen.findByLabelText("运行配置");
      // 动效默认关闭时 aria-label 为 "开启动画"
      expect(
        screen.getByRole("button", { name: "开启动画" })
      ).toBeInTheDocument();
    } finally {
      window.matchMedia = origMatchMedia;
      try {
        window.localStorage.removeItem("animationsEnabled");
      } catch {
        // 忽略
      }
    }
  });
});

// ===== Day 12 显式保存 =====

describe("Day 12 显式保存", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    fetchScenarioMock.mockResolvedValue(scenarioFixture);
    postEvaluationMock.mockImplementation((input: RunInput) =>
      Promise.resolve(makeResult(input))
    );
    saveRunMock.mockImplementation((input: RunInput) =>
      Promise.resolve(makeSavedRecord(input))
    );
  });

  it("顶部阶段标题更新为 Day 12，学习记录页如实说明保存支持", async () => {
    render(<App />);
    await screen.findByText(/Day 12 · 显式保存与规则解释/);
    fireEvent.click(screen.getByRole("button", { name: "学习记录" }));
    expect(
      screen.getByText(/已支持在沙盘工作台显式保存一次成功运行/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/不保存任何运行/)).not.toBeInTheDocument();
  });

  it("尚未运行时不显示保存入口", async () => {
    await renderWorkbench();
    expect(
      screen.queryByRole("button", { name: "保存此配置的推演" })
    ).not.toBeInTheDocument();
  });

  it("保存成功：请求体只有 RunInput 快照，成功提示取响应的 id/savedAt/解释", async () => {
    await renderWorkbench();
    fireEvent.click(getDefenseButton("D1"));
    await screen.findByText(/路径 B 仍到达模拟数据/);

    fireEvent.click(screen.getByRole("button", { name: "保存此配置的推演" }));
    expect(saveRunMock).toHaveBeenCalledTimes(1);
    const payload = saveRunMock.mock.calls[0][0] as RunInput;
    expect(payload).toEqual({
      scenarioId: "campus-registration",
      presetId: "A",
      conditions: { O: "open", T: "granted" },
      defenses: ["D1"]
    });
    expect(payload).not.toHaveProperty("result");
    expect(payload).not.toHaveProperty("explanation");

    await screen.findByText(/已保存运行 #record-fixed-id-001/);
    expect(
      screen.getByText(/保存时间\s*2026-11-04T10:20:30\.000Z/)
    ).toBeInTheDocument();
    expect(screen.getByText(/一句话解释（\s*规则模板/)).toBeInTheDocument();
    expect(
      screen.getByText(/路径 A 在 A3 被阻断（D1 已开启，管理导出接口拒绝请求）/)
    ).toBeInTheDocument();
  });

  it("保存中按钮禁用，重复点击不产生第二次请求", async () => {
    let resolveSave: (() => void) | undefined;
    saveRunMock.mockImplementation(
      (input: RunInput) =>
        new Promise<RunRecord>((resolve) => {
          resolveSave = () => resolve(makeSavedRecord(input));
        })
    );
    await renderWorkbench();
    fireEvent.click(getDefenseButton("D1"));
    await screen.findByText(/路径 B 仍到达模拟数据/);

    fireEvent.click(screen.getByRole("button", { name: "保存此配置的推演" }));
    const savingButton = await screen.findByRole("button", {
      name: "正在保存…"
    });
    expect(savingButton).toBeDisabled();
    fireEvent.click(savingButton);
    expect(saveRunMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSave?.();
    });
    await screen.findByText(/已保存运行 #record-fixed-id-001/);
  });

  it("保存失败显示错误且不伪装成功，重试后展示成功", async () => {
    saveRunMock
      .mockRejectedValueOnce(new Error("HTTP 500"))
      .mockImplementation((input: RunInput) =>
        Promise.resolve(makeSavedRecord(input))
      );
    await renderWorkbench();
    fireEvent.click(getDefenseButton("D1"));
    await screen.findByText(/路径 B 仍到达模拟数据/);

    fireEvent.click(screen.getByRole("button", { name: "保存此配置的推演" }));
    await screen.findByText(/保存失败：HTTP 500/);
    expect(screen.queryByText(/已保存运行/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "保存此配置的推演" }));
    await screen.findByText(/已保存运行 #record-fixed-id-001/);
    expect(saveRunMock).toHaveBeenCalledTimes(2);
  });

  it("保存未返回时开始新一轮运行，旧保存响应不错误归属新配置", async () => {
    let resolveSave: (() => void) | undefined;
    saveRunMock.mockImplementation(
      (input: RunInput) =>
        new Promise<RunRecord>((resolve) => {
          resolveSave = () => resolve(makeSavedRecord(input));
        })
    );
    await renderWorkbench();
    fireEvent.click(getDefenseButton("D1"));
    await screen.findByText(/路径 B 仍到达模拟数据/);

    fireEvent.click(screen.getByRole("button", { name: "保存此配置的推演" }));
    await screen.findByRole("button", { name: "正在保存…" });

    // 保存仍在途：关掉 D1，触发新一轮无防御运行
    fireEvent.click(getDefenseButton("D1"));
    await screen.findByText(/当前运行即为无防御基线/);

    // 旧保存响应此刻才返回，不得把新运行标记为已保存
    await act(async () => {
      resolveSave?.();
    });
    await waitFor(() =>
      expect(screen.queryByText(/已保存运行/)).not.toBeInTheDocument()
    );
    expect(
      screen.getByRole("button", { name: "保存此配置的推演" })
    ).toBeEnabled();
  });

  it("保存未返回时切预设，旧保存响应不显示", async () => {
    let resolveSave: (() => void) | undefined;
    saveRunMock.mockImplementation(
      (input: RunInput) =>
        new Promise<RunRecord>((resolve) => {
          resolveSave = () => resolve(makeSavedRecord(input));
        })
    );
    await renderWorkbench();
    fireEvent.click(getDefenseButton("D1"));
    await screen.findByText(/路径 B 仍到达模拟数据/);

    fireEvent.click(screen.getByRole("button", { name: "保存此配置的推演" }));
    await screen.findByRole("button", { name: "正在保存…" });

    fireEvent.click(screen.getByText("预设 B：O 关 T 有"));
    await screen.findByText(/尚未运行/);

    await act(async () => {
      resolveSave?.();
    });
    await waitFor(() =>
      expect(screen.queryByText(/已保存运行/)).not.toBeInTheDocument()
    );
    expect(
      screen.queryByRole("button", { name: "保存此配置的推演" })
    ).not.toBeInTheDocument();
  });

  it("滑块、防御切换、基线补跑、播放跳转均不调用 saveRun", async () => {
    await renderWorkbench();

    // 防御切换触发运行（此时无同条件基线）
    fireEvent.click(getDefenseButton("D1"));
    await waitFor(() => expect(postEvaluationMock).toHaveBeenCalledTimes(1));

    // 滑块提交触发运行
    const oSlider = getOSlider();
    fireEvent.input(oSlider, { target: { value: "1" } });
    fireEvent.mouseUp(oSlider);
    await waitFor(() => expect(postEvaluationMock).toHaveBeenCalledTimes(2));

    // 再切防御触发运行
    fireEvent.click(getDefenseButton("D3"));
    await waitFor(() => expect(postEvaluationMock).toHaveBeenCalledTimes(3));

    // 补跑无防御基线
    fireEvent.click(
      screen.getByRole("button", { name: "运行当前条件的无防御基线" })
    );
    await waitFor(() => expect(postEvaluationMock).toHaveBeenCalledTimes(4));

    // 播放/跳转属于纯本地操作
    fireEvent.click(screen.getByRole("button", { name: "跳转到事件 3" }));
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));

    expect(saveRunMock).not.toHaveBeenCalled();
  });
});
