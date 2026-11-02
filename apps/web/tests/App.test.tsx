import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RunInput, RunResult, Scenario } from "@link-lab/contracts";
import App from "../src/App";

vi.mock("../src/api", () => ({
  fetchScenario: vi.fn(),
  postEvaluation: vi.fn()
}));

import { fetchScenario, postEvaluation } from "../src/api";

type MockFn = ReturnType<typeof vi.fn>;
const fetchScenarioMock = fetchScenario as unknown as MockFn;
const postEvaluationMock = postEvaluation as unknown as MockFn;

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

/** 测试用返回值：仅用于驱动对比展示，不代表引擎规则。 */
function makeResult(input: RunInput): RunResult {
  const hasD1 = input.defenses.includes("D1");
  const hasD3 = input.defenses.includes("D3");
  const pathA = hasD1
    ? {
        pathId: "A" as const,
        outcome: "blocked" as const,
        firstBlockedStepId: "A3" as const,
        blockedReason: "D1 已开启，管理导出接口拒绝请求"
      }
    : { pathId: "A" as const, outcome: "reached" as const };
  const pathB =
    input.conditions.O === "closed"
      ? {
          pathId: "B" as const,
          outcome: "blocked" as const,
          firstBlockedStepId: "B2" as const,
          blockedReason: "诊断页面对普通账号关闭，访问被拒绝"
        }
      : { pathId: "B" as const, outcome: "reached" as const };
  return {
    events: [],
    pathResults: [pathA, pathB],
    alertCount: hasD3 ? 2 : 0
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
    // 新增用例会按 input 定制返回值，必须彻底复位，避免污染既有用例
    vi.resetAllMocks();
    fetchScenarioMock.mockResolvedValue(scenarioFixture);
    postEvaluationMock.mockResolvedValue(okResult);
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
    // 让 postEvaluation 永不 resolve，使组件停在 running 状态
    postEvaluationMock.mockReturnValue(new Promise(() => {}));

    // 触发一次运行进入 running
    fireEvent.click(getDefenseButton("D1"));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "正在运行…" })
      ).toBeInTheDocument()
    );
    expect(postEvaluationMock).toHaveBeenCalledTimes(1);

    // running 状态下点击 D2：不提交
    fireEvent.click(getDefenseButton("D2"));
    // running 状态下拖动并释放滑块：不提交
    const oSlider = getOSlider();
    fireEvent.input(oSlider, { target: { value: "1" } });
    fireEvent.mouseUp(oSlider);

    expect(postEvaluationMock).toHaveBeenCalledTimes(1);
  });

  it("切换预设后结果清空且不自动提交", async () => {
    await renderWorkbench();
    // 先运行一次得到结果
    fireEvent.click(getDefenseButton("D1"));
    await screen.findByText("路径结果");
    expect(postEvaluationMock).toHaveBeenCalledTimes(1);

    // 切换预设 B
    fireEvent.click(screen.getByText("预设 B：O 关 T 有"));

    // 不再有新的提交，结果面板回到 idle
    expect(postEvaluationMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/尚未运行/)).toBeInTheDocument();
  });

  it("同条件下显示基线 vs 当前对比", async () => {
    postEvaluationMock.mockImplementation((input: RunInput) =>
      Promise.resolve(makeResult(input))
    );
    await renderWorkbench();

    // 首次无防御运行：当前运行即为基线，只提示、不显示差异
    fireEvent.click(screen.getByRole("button", { name: "运行当前配置" }));
    await screen.findByText(/当前运行即为无防御基线/);
    expect(screen.queryByText(COMPARISON_TITLE)).not.toBeInTheDocument();

    // 开启 D1：同 O/T 下自动出现对比
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

    // 直接开 D1：没有同条件基线，出现提示与补跑按钮
    fireEvent.click(getDefenseButton("D1"));
    await screen.findByText(/当前 O\/T 尚无无防御基线/);
    const callsBefore = postEvaluationMock.mock.calls.length;

    fireEvent.click(
      screen.getByRole("button", { name: "运行当前条件的无防御基线" })
    );
    await screen.findByText(COMPARISON_TITLE);

    // 只多一次请求，且该请求 defenses 为空
    expect(postEvaluationMock.mock.calls.length).toBe(callsBefore + 1);
    const baselineCall = postEvaluationMock.mock.calls[callsBefore][0] as RunInput;
    expect(baselineCall.defenses).toEqual([]);

    // D1 仍激活，当前干预结果未被覆盖（对比里 A 由到达变为阻断）
    expect(getDefenseButton("D1")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("由到达变为阻断")).toBeInTheDocument();
  });

  it("过期基线响应不能恢复旧对比", async () => {
    let resolveBaseline: ((result: RunResult) => void) | undefined;
    postEvaluationMock.mockImplementation((input: RunInput) => {
      if (input.defenses.length === 0) {
        // 补跑基线：先挂起，稍后手动 resolve
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

    // O 变化 → 基线失效；旧请求仍挂起
    const oSlider = getOSlider();
    fireEvent.input(oSlider, { target: { value: "1" } });
    fireEvent.mouseUp(oSlider);

    // 旧基线响应晚返回，不得恢复对比
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
});
