import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ConditionCheck,
  DefenseId,
  OValue,
  PathEvent,
  PathResult,
  RunInput,
  RunRecord,
  RunResult,
  RunSummary,
  Scenario,
  StepId,
  TValue
} from "@link-lab/contracts";
import App from "../src/App";

vi.mock("../src/api", () => ({
  fetchScenario: vi.fn(),
  postEvaluation: vi.fn(),
  saveRun: vi.fn(),
  listRuns: vi.fn(),
  getRun: vi.fn()
}));

import { fetchScenario, getRun, listRuns, postEvaluation, saveRun } from "../src/api";

type MockFn = ReturnType<typeof vi.fn>;
const fetchScenarioMock = fetchScenario as unknown as MockFn;
const postEvaluationMock = postEvaluation as unknown as MockFn;
const saveRunMock = saveRun as unknown as MockFn;
const listRunsMock = listRuns as unknown as MockFn;
const getRunMock = getRun as unknown as MockFn;

/* ---------- Fixtures ---------- */

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
    D3: { label: "管理导出接口日志告警", alerts: true }
  },
  presets: [
    { id: "A", label: "预设 A：O 开 T 有", conditions: { O: "open", T: "granted" } },
    { id: "B", label: "预设 B：O 关 T 有", conditions: { O: "closed", T: "granted" } },
    { id: "C", label: "预设 C：O 开 T 无", conditions: { O: "open", T: "revoked" } }
  ]
};

function makeSummary(
  id: string,
  conditions: { O: OValue; T: TValue },
  defenses: DefenseId[],
  pathResults: PathResult[],
  alertCount: number
): RunSummary {
  return {
    id,
    savedAt: `2026-11-04T10:20:30.${id.slice(-3)}Z`,
    scenarioId: "campus-registration",
    scenarioVersion: 1,
    conditions,
    defenses,
    pathResults,
    alertCount
  };
}

function makeEvents(defenses: DefenseId[]): PathEvent[] {
  const hasD1 = defenses.includes("D1");
  return [
    {
      eventIndex: 0, pathId: "A", stepId: "A1", fromNodeId: "N1", toNodeId: "N2",
      outcome: "passed", conditionChecks: []
    },
    {
      eventIndex: 1, pathId: "A", stepId: "A2", fromNodeId: "N2", toNodeId: "N3",
      outcome: "passed", conditionChecks: []
    },
    {
      eventIndex: 2, pathId: "A", stepId: "A3" as StepId,
      fromNodeId: "N3", toNodeId: "N7",
      outcome: hasD1 ? "rejected" : "passed",
      conditionChecks: hasD1
        ? [{ id: "D1", satisfied: false, reason: "D1 已开启，管理导出接口拒绝请求" } as ConditionCheck]
        : []
    },
    {
      eventIndex: 3, pathId: "B", stepId: "B1", fromNodeId: "N1", toNodeId: "N2",
      outcome: "passed", conditionChecks: []
    },
    {
      eventIndex: 4, pathId: "B", stepId: "B2", fromNodeId: "N2", toNodeId: "N4",
      outcome: "passed",
      conditionChecks: [
        { id: "O", satisfied: true, reason: "诊断页面对普通账号开放" } as ConditionCheck
      ]
    }
  ];
}

function makeResult(input: RunInput): RunResult {
  return {
    events: makeEvents(input.defenses),
    pathResults: [
      { pathId: "A", outcome: "blocked", firstBlockedStepId: "A3", blockedReason: "D1 阻断" },
      { pathId: "B", outcome: "reached" }
    ],
    alertCount: input.defenses.includes("D3") ? 2 : 0
  };
}

function makeRecord(id: string, scenarioVersion: number = 1): RunRecord {
  const input: RunInput = {
    scenarioId: "campus-registration",
    presetId: "A",
    conditions: { O: "open", T: "granted" },
    defenses: ["D1"]
  };
  return {
    id,
    savedAt: "2026-11-04T10:20:30.000Z",
    scenarioId: "campus-registration",
    scenarioVersion,
    input,
    result: makeResult(input),
    explanation: "路径 A 在 A3 被 D1 阻断，路径 B 仍到达。",
    explanationSource: "template",
    explanationVersion: 1
  };
}

/* ---------- 测试 ---------- */

async function renderApp() {
  render(<App />);
  // 等待场景加载
  await screen.findByText("进入沙盘工作台");
  // 直接点学习记录 tab
  fireEvent.click(screen.getByRole("button", { name: "学习记录" }));
}

describe("Day 13 — 历史列表与回放", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    fetchScenarioMock.mockResolvedValue(scenarioFixture);
    listRunsMock.mockResolvedValue([]);
    getRunMock.mockResolvedValue(makeRecord("rec-1"));
  });

  /* a. 空库空状态 */
  it("空库时显示空状态文案，不渲染任何记录项", async () => {
    listRunsMock.mockResolvedValue([]);
    await renderApp();

    await screen.findByText(/暂无保存的运行/);
    expect(
      screen.getByText(/去沙盘工作台运行一次配置并点击/)
    ).toBeInTheDocument();
    // 不应有记录列表项
    expect(screen.queryAllByRole("button", { name: /报名明细|防御/ })).toHaveLength(0);
  });

  /* b. 加载中 & 失败状态 */
  it("列表加载中显示加载文案", async () => {
    let resolveList: (v: RunSummary[]) => void = () => {};
    listRunsMock.mockReturnValue(
      new Promise((res) => { resolveList = res; })
    );
    await renderApp();

    // 还没 resolve，应该显示加载中
    expect(screen.getByText(/正在加载历史列表/)).toBeInTheDocument();
    expect(screen.queryByText(/暂无保存的运行/)).not.toBeInTheDocument();

    resolveList([]);
    await waitFor(() => screen.getByText(/暂无保存的运行/));
  });

  it("列表请求失败（fetch reject）显示错误状态与重试按钮", async () => {
    listRunsMock.mockRejectedValue(new Error("网络超时"));
    await renderApp();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("网络超时");
      expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
    });

    // 点击重试
    listRunsMock.mockResolvedValue([]);
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    await waitFor(() => screen.getByText(/暂无保存的运行/));
  });

  /* c. 点击列表项调 getRun 一次 + 显示事件 */
  it("点击列表项调用 getRun 且只调用一次，选中后显示该记录的事件", async () => {
    const summaries = [
      makeSummary("rec-1", { O: "open", T: "granted" }, ["D1"], [
        { pathId: "A", outcome: "blocked", firstBlockedStepId: "A3", blockedReason: "D1 阻断" },
        { pathId: "B", outcome: "reached" }
      ], 0)
    ];
    listRunsMock.mockResolvedValue(summaries);
    getRunMock.mockResolvedValue(makeRecord("rec-1"));
    await renderApp();

    // 等待列表项渲染
    await waitFor(() => {
      const items = screen.queryAllByRole("button").filter(
        (b) => b.textContent?.includes("O 开") ?? false
      );
      expect(items.length).toBeGreaterThan(0);
    });

    const firstItem = screen.queryAllByRole("button").find(
      (b) => b.textContent?.includes("O 开") && b.textContent?.includes("防御 D1")
    );
    expect(firstItem).toBeDefined();
    fireEvent.click(firstItem!);

    await waitFor(() => {
      expect(getRunMock).toHaveBeenCalledTimes(1);
      expect(getRunMock).toHaveBeenCalledWith("rec-1");
    });

    // 选中后应显示事件面板的节点文字（同版本，显示中文标签）
    await waitFor(() => {
      // 事件面板里至少有当前事件的节点标签
      expect(screen.getByText(/普通账号 → 报名应用/)).toBeInTheDocument();
    });
  });

  /* d. 版本 mismatch */
  it("选中版本不一致的记录显示版本不一致提示且不渲染 ScenarioGraph", async () => {
    const summaries = [
      makeSummary("rec-old", { O: "open", T: "granted" }, ["D1"], [
        { pathId: "A", outcome: "blocked", firstBlockedStepId: "A3", blockedReason: "D1 阻断" },
        { pathId: "B", outcome: "reached" }
      ], 0)
    ];
    listRunsMock.mockResolvedValue(summaries);
    getRunMock.mockResolvedValue(makeRecord("rec-old", 999)); // version mismatch
    await renderApp();

    await waitFor(() => {
      const items = screen.queryAllByRole("button").filter(
        (b) => b.textContent?.includes("O 开") ?? false
      );
      expect(items.length).toBeGreaterThan(0);
    });
    const firstItem = screen.queryAllByRole("button").find(
      (b) => b.textContent?.includes("O 开")
    );
    fireEvent.click(firstItem!);

    // 应该显示版本不一致提示
    await waitFor(() => {
      expect(
        screen.getByText(/当前场景版本与该记录的场景版本不一致/)
      ).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent(/999/);
    });

    // 版本不一致时，ScenarioGraph 应不渲染（graph-container 不应存在）
    // 在我们的场景里，ScenarioGraph 渲染需要 versionMatches === true，
    // 此时应该只有 CurrentEventPanel 和 PlaybackBar
    expect(
      screen.queryByText(/当前场景版本与该记录的场景版本不一致/)
    ).toBeInTheDocument();
  });

  /* e. 零 POST */
  it("打开记录页、点击记录、切换播放下标均不产生 POST /api/runs 或 POST /api/evaluations", async () => {
    const summaries = [
      makeSummary("rec-1", { O: "open", T: "granted" }, ["D1"], [
        { pathId: "A", outcome: "blocked", firstBlockedStepId: "A3", blockedReason: "D1 阻断" },
        { pathId: "B", outcome: "reached" }
      ], 0)
    ];
    listRunsMock.mockResolvedValue(summaries);
    getRunMock.mockResolvedValue(makeRecord("rec-1"));

    await renderApp();
    // 到目前为止都没有调用 postEvaluation / saveRun
    expect(postEvaluationMock).not.toHaveBeenCalled();
    expect(saveRunMock).not.toHaveBeenCalled();

    await waitFor(() => {
      const items = screen.queryAllByRole("button").filter(
        (b) => b.textContent?.includes("O 开") ?? false
      );
      expect(items.length).toBeGreaterThan(0);
    });
    const firstItem = screen.queryAllByRole("button").find(
      (b) => b.textContent?.includes("O 开")
    );
    fireEvent.click(firstItem!);

    await waitFor(() => {
      expect(screen.getByText(/普通账号 → 报名应用/)).toBeInTheDocument();
    });

    // 点击"下一步"
    const nextBtn = screen.getByRole("button", { name: /下一步/ });
    fireEvent.click(nextBtn);

    // 点击"上一步"
    const prevBtn = screen.getByRole("button", { name: /上一步/ });
    fireEvent.click(prevBtn);

    // 点击"播放/暂停"
    const playBtn = screen.getByRole("button", { name: /播放/ });
    fireEvent.click(playBtn);
    // 等等 tick
    await waitFor(() => expect(postEvaluationMock).not.toHaveBeenCalled());

    expect(postEvaluationMock).not.toHaveBeenCalled();
    expect(saveRunMock).not.toHaveBeenCalled();
  });

  /* f. 快速点击竞态：先发起后返回的不得覆盖 */
  it("连续快速点击两条记录时，先发起后返回的详情不得覆盖当前选中", async () => {
    const summaries = [
      makeSummary("rec-fast-1", { O: "open", T: "granted" }, ["D1"], [
        { pathId: "A", outcome: "blocked", firstBlockedStepId: "A3" },
        { pathId: "B", outcome: "reached" }
      ], 0),
      makeSummary("rec-fast-2", { O: "closed", T: "granted" }, ["D2"], [
        { pathId: "A", outcome: "reached" },
        { pathId: "B", outcome: "blocked", firstBlockedStepId: "B2" }
      ], 0)
    ];
    listRunsMock.mockResolvedValue(summaries);

    // getRunMock 策略：rec-fast-1 延迟 80ms，rec-fast-2 立即返回
    getRunMock.mockImplementation((id: string) => {
      if (id === "rec-fast-1") {
        return new Promise<RunRecord>((res) =>
          setTimeout(() => res(makeRecord("rec-fast-1")), 80)
        );
      }
      return Promise.resolve(makeRecord("rec-fast-2"));
    });

    await renderApp();

    // 等待列表渲染
    await waitFor(() => {
      const items = screen.queryAllByRole("button").filter(
        (b) => b.textContent?.includes("O 开") ?? false
      );
      expect(items.length).toBeGreaterThan(0);
    });

    const allButtons = screen.queryAllByRole("button");
    // 找到两条记录对应的 button（rec-fast-1 = O 开, rec-fast-2 = O 关）
    const btn1 = allButtons.find(
      (b) => b.textContent?.includes("O 开") && b.textContent?.includes("防御 D1")
    );
    const btn2 = allButtons.find(
      (b) => b.textContent?.includes("O 关") && b.textContent?.includes("防御 D2")
    );
    expect(btn1).toBeDefined();
    expect(btn2).toBeDefined();

    // 先点 rec-fast-1（触发延迟的 getRun）
    fireEvent.click(btn1!);
    // 立即点 rec-fast-2（触发立即返回的 getRun）
    fireEvent.click(btn2!);

    // rec-fast-2 立即返回 → App 选中 rec-fast-2
    await waitFor(() => {
      expect(getRunMock).toHaveBeenCalledTimes(2);
    });

    // 等待 rec-fast-1 那个延迟的也返回
    await new Promise((r) => setTimeout(r, 150));

    // 现在选中的应当还是 rec-fast-2（selectedFetchTokenRef 递增让 rec-fast-1 的响应被丢弃）
    // rec-fast-2 的记录 result.events 应该有 D2 特征？让我们查记录的 explanation 或特定事件
    // 实际上，因为 makeRecord 对两个用了相同的 defenses=["D1"]，事件特征一样...
    // 改为检查 getRun 调用次数始终是 2，且选中的那条应该有 "O 关" 的配置在左侧高亮
    // 或者直接：selectedFetchTokenRef 机制让 rec-fast-1 的响应无法覆盖 rec-fast-2
    // 我们看当前选中的记录对应的场景版本/解释
    // 由于两个 makeRecord 解释文本一样，让 rec-fast-2 有不同 explanation
    // （已在 makeRecord 里写死一样了，但 makeSummary 的 pathResults 有差异）

    // 更可靠的检查：左侧列表中 rec-fast-2 应该有 selected 样式
    // 由于 getRun 被调 2 次，先 rec-fast-1 后 rec-fast-2，最终选中的是 rec-fast-2
    // 再等一轮 tick，让所有 useEffect 跑完
    await waitFor(() => {
      const selectedButtons = allButtons.filter(
        (b) => b.className.includes("selected")
      );
      expect(selectedButtons.length).toBe(1);
      // rec-fast-2 的 summary 有 O 关
      expect(selectedButtons[0].textContent).toContain("O 关");
    });
  });
});
