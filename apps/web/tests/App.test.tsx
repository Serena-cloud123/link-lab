import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Scenario } from "@link-lab/contracts";
import App from "../src/App";

vi.mock("../src/api", () => ({
  fetchScenario: vi.fn(),
  postEvaluation: vi.fn()
}));

import { fetchScenario, postEvaluation } from "../src/api";

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

const okResult = {
  events: [],
  pathResults: [],
  alertCount: 0
};

async function renderWorkbench() {
  (fetchScenario as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
    scenarioFixture
  );
  (postEvaluation as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
    okResult
  );
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

describe("App 工作bench 交互", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("拖动滑块（input）不提交", async () => {
    await renderWorkbench();
    const oSlider = getOSlider();

    fireEvent.input(oSlider, { target: { value: "1" } });

    expect(postEvaluation).not.toHaveBeenCalled();
  });

  it("拖动后 mouseUp 提交一次，O=closed", async () => {
    await renderWorkbench();
    const oSlider = getOSlider();

    fireEvent.input(oSlider, { target: { value: "1" } });
    fireEvent.mouseUp(oSlider);

    expect(postEvaluation).toHaveBeenCalledTimes(1);
    const input = (
      postEvaluation as unknown as ReturnType<typeof vi.fn>
    ).mock.calls[0][0];
    expect(input.conditions.O).toBe("closed");
  });

  it("拖到新值再拖回原位，mouseUp 不提交", async () => {
    await renderWorkbench();
    const oSlider = getOSlider();

    fireEvent.input(oSlider, { target: { value: "1" } });
    fireEvent.input(oSlider, { target: { value: "0" } });
    fireEvent.mouseUp(oSlider);

    expect(postEvaluation).not.toHaveBeenCalled();
  });

  it("mouseUp 后再 blur 只提交一次（去重）", async () => {
    await renderWorkbench();
    const oSlider = getOSlider();

    fireEvent.input(oSlider, { target: { value: "1" } });
    fireEvent.mouseUp(oSlider);
    fireEvent.blur(oSlider);

    expect(postEvaluation).toHaveBeenCalledTimes(1);
  });

  it("点击 D1 提交一次，defenses=['D1']", async () => {
    await renderWorkbench();
    const d1 = getDefenseButton("D1");

    fireEvent.click(d1);

    expect(postEvaluation).toHaveBeenCalledTimes(1);
    const input = (
      postEvaluation as unknown as ReturnType<typeof vi.fn>
    ).mock.calls[0][0];
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
    (
      postEvaluation as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue(new Promise(() => {}));

    // 触发一次运行进入 running
    fireEvent.click(getDefenseButton("D1"));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "正在运行…" })
      ).toBeInTheDocument()
    );
    expect(postEvaluation).toHaveBeenCalledTimes(1);

    // running 状态下点击 D2：不提交
    fireEvent.click(getDefenseButton("D2"));
    // running 状态下拖动并释放滑块：不提交
    const oSlider = getOSlider();
    fireEvent.input(oSlider, { target: { value: "1" } });
    fireEvent.mouseUp(oSlider);

    expect(postEvaluation).toHaveBeenCalledTimes(1);
  });

  it("切换预设后结果清空且不自动提交", async () => {
    await renderWorkbench();
    // 先运行一次得到结果
    fireEvent.click(getDefenseButton("D1"));
    await screen.findByText("路径结果");
    expect(postEvaluation).toHaveBeenCalledTimes(1);

    // 切换预设 B
    fireEvent.click(screen.getByText("预设 B：O 关 T 有"));

    // 不再有新的提交，结果面板回到 idle
    expect(postEvaluation).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/尚未运行/)).toBeInTheDocument();
  });
});
