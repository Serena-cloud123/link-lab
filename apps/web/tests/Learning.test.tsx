import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ConditionCheck,
  DefenseId,
  LearningFeedback,
  LearningQuestion,
  LearningRecord,
  PathEvent,
  PathResult,
  RunInput,
  RunRecord,
  RunResult,
  RunSummary,
  Scenario
} from "@link-lab/contracts";
import App from "../src/App";

vi.mock("../src/api", () => ({
  fetchScenario: vi.fn(),
  postEvaluation: vi.fn(),
  saveRun: vi.fn(),
  listRuns: vi.fn(),
  getRun: vi.fn(),
  getLearningQuestions: vi.fn(),
  saveLearning: vi.fn(),
  getRunLearning: vi.fn()
}));

import {
  fetchScenario,
  getLearningQuestions,
  getRun,
  getRunLearning,
  listRuns,
  postEvaluation,
  saveLearning,
  saveRun
} from "../src/api";

type MockFn = ReturnType<typeof vi.fn>;
const fetchScenarioMock = fetchScenario as unknown as MockFn;
const postEvaluationMock = postEvaluation as unknown as MockFn;
const saveRunMock = saveRun as unknown as MockFn;
const listRunsMock = listRuns as unknown as MockFn;
const getRunMock = getRun as unknown as MockFn;
const getLearningQuestionsMock = getLearningQuestions as unknown as MockFn;
const saveLearningMock = saveLearning as unknown as MockFn;
const getRunLearningMock = getRunLearning as unknown as MockFn;

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

const questionsFixture: LearningQuestion[] = [
  {
    id: "Q1",
    prompt: "预设 A（O 开放、T 有权限）仅启用 D1 时，报名明细是否仍可到达？",
    options: [
      { id: "0", text: "能到达——路径 B 不受 D1 影响，仍可到达报名明细" },
      { id: "1", text: "不能到达——路径 A 与路径 B 都被 D1 阻断" },
      { id: "2", text: "不能到达——因为服务令牌没有明细读取权限（T 无权限）" },
      { id: "3", text: "不能到达——路径 B 在 B2 处被 O 条件拒绝" }
    ],
    config: {
      presetId: "A",
      conditions: { O: "open", T: "granted" },
      defenses: ["D1"]
    }
  },
  {
    id: "Q2",
    prompt: "预设 A（O 开放、T 有权限）仅启用 D3 时，数据是否被阻断？",
    options: [
      { id: "0", text: "被阻断——两条路径都被 D3 拦住" },
      { id: "1", text: "被阻断——D3 会把两条路径都拦截" },
      { id: "2", text: "未被阻断——A/B 都能到达，并且出现告警" }
    ],
    config: {
      presetId: "A",
      conditions: { O: "open", T: "granted" },
      defenses: ["D3"]
    }
  },
  {
    id: "Q3",
    prompt:
      "迁移题：预设 B（O 关闭、T 有权限）只启用 D1 时，是否还必须再启用 D2 才能阻断两条已建模路径？",
    options: [
      { id: "0", text: "不必——B2 因 O 关闭被拒，后续步骤未执行，D1 已阻断路径 A" },
      { id: "1", text: "必须——否则路径 B 仍能到达报名明细" }
    ],
    config: {
      presetId: "B",
      conditions: { O: "closed", T: "granted" },
      defenses: ["D1"]
    }
  }
];

const feedbacksFixture: LearningFeedback[] = [
  {
    questionId: "Q1",
    correctOption: "0",
    predictedOption: "0",
    isCorrect: true,
    conditionBasis:
      "路径 A 被阻断：D1 已开启，管理导出接口拒绝请求；路径 B 未命中阻断条件，最终到达报名明细。",
    evidence: {
      pathA: "blocked",
      pathB: "reached",
      alertCount: 0,
      blockedStepId: "A3",
      conditionCheck: null
    }
  },
  {
    questionId: "Q2",
    correctOption: "2",
    predictedOption: "1",
    isCorrect: false,
    conditionBasis:
      "D3 只记录告警、不阻断：A/B 均到达，本次推演共产生 2 条告警。",
    evidence: {
      pathA: "reached",
      pathB: "reached",
      alertCount: 2,
      blockedStepId: null,
      conditionCheck: null
    }
  },
  {
    questionId: "Q3",
    correctOption: "0",
    predictedOption: "0",
    isCorrect: true,
    conditionBasis: "诊断页面对普通账号关闭，访问被拒绝",
    evidence: {
      pathA: "blocked",
      pathB: "blocked",
      alertCount: 0,
      blockedStepId: "B2",
      conditionCheck: {
        id: "O",
        actualValue: "closed",
        satisfied: false,
        reason: "诊断页面对普通账号关闭，访问被拒绝"
      } as ConditionCheck
    }
  }
];

function makeEvents(defenses: DefenseId[]): PathEvent[] {
  const blocked = defenses.includes("D1");
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
      eventIndex: 2, pathId: "A", stepId: "A3", fromNodeId: "N3", toNodeId: "N7",
      outcome: blocked ? "rejected" : "data-arrived",
      conditionChecks: []
    },
    {
      eventIndex: 3, pathId: "B", stepId: "B1", fromNodeId: "N1", toNodeId: "N2",
      outcome: "passed", conditionChecks: []
    },
    {
      eventIndex: 4, pathId: "B", stepId: "B2", fromNodeId: "N2", toNodeId: "N4",
      outcome: "passed", conditionChecks: []
    },
    {
      eventIndex: 5, pathId: "B", stepId: "B5", fromNodeId: "N6", toNodeId: "N7",
      outcome: "data-arrived", conditionChecks: []
    }
  ];
}

function makeResult(input: RunInput): RunResult {
  return {
    events: makeEvents(input.defenses),
    pathResults: [
      input.defenses.includes("D1")
        ? { pathId: "A", outcome: "blocked", firstBlockedStepId: "A3", blockedReason: "D1 阻断" }
        : { pathId: "A", outcome: "reached" },
      { pathId: "B", outcome: "reached" }
    ],
    alertCount: input.defenses.includes("D3") ? 2 : 0
  };
}

function makeSavedRecord(input: RunInput): RunRecord {
  return {
    id: "record-fixed-id-001",
    savedAt: "2026-11-04T10:20:30.000Z",
    scenarioId: input.scenarioId,
    scenarioVersion: 1,
    input,
    result: makeResult(input),
    explanation: "路径 A 在 A3 被阻断，但路径 B 仍到达模拟数据。",
    explanationSource: "template",
    explanationVersion: 1
  };
}

function makeLearningRecord(
  runId: string,
  predictions: Record<"Q1" | "Q2" | "Q3", string>,
  resumedEventIndex: number | null
): LearningRecord {
  return {
    id: "learning-fixed-id-001",
    runId,
    savedAt: "2026-11-04T10:20:40.000Z",
    questions: questionsFixture,
    predictions,
    feedbacks: feedbacksFixture,
    resumedEventIndex
  };
}

async function renderWorkbenchWithRun() {
  render(<App />);
  await screen.findByText("进入沙盘工作台");
  fireEvent.click(screen.getByText("进入沙盘工作台"));
  await screen.findByLabelText("运行配置");
  // 切换防御触发一次运行，让答题区出现
  fireEvent.click(screen.getByRole("button", { name: /D1/ }));
  await screen.findByText("三题自测");
}

async function waitQuestions() {
  await screen.findByText(/能到达——路径 B 不受 D1 影响/);
}

function selectOption(text: RegExp) {
  fireEvent.click(screen.getByRole("button", { name: text }));
}

describe("Day 13 — 三题与学习记录（前端）", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    fetchScenarioMock.mockResolvedValue(scenarioFixture);
    postEvaluationMock.mockImplementation((input: RunInput) =>
      Promise.resolve(makeResult(input))
    );
    saveRunMock.mockImplementation((input: RunInput) =>
      Promise.resolve(makeSavedRecord(input))
    );
    getLearningQuestionsMock.mockResolvedValue(questionsFixture);
    listRunsMock.mockResolvedValue([]);
    getRunLearningMock.mockResolvedValue(null);
    saveLearningMock.mockImplementation(
      (request: {
        runId: string;
        predictions: Record<"Q1" | "Q2" | "Q3", string>;
        resumedEventIndex?: number | null;
      }) =>
        Promise.resolve(
          makeLearningRecord(
            request.runId,
            request.predictions,
            request.resumedEventIndex ?? null
          )
        )
    );
  });

  it("每题固定显示自己的配置，并明确区别于工作台当前配置", async () => {
    await renderWorkbenchWithRun();
    await waitQuestions();

    expect(
      screen.getByText("本题固定配置：预设 A · O 开放 · T 有权限 · 防御 D1")
    ).toBeInTheDocument();
    expect(
      screen.getByText("本题固定配置：预设 A · O 开放 · T 有权限 · 防御 D3")
    ).toBeInTheDocument();
    expect(
      screen.getByText("本题固定配置：预设 B · O 关闭 · T 有权限 · 防御 D1")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/与上方工作台当前配置无关/)
    ).toBeInTheDocument();
  });

  it("未保存运行前提交按钮禁用，并提示先保存", async () => {
    await renderWorkbenchWithRun();
    await waitQuestions();

    selectOption(/能到达——路径 B 不受 D1 影响/);
    selectOption(/未被阻断——A\/B 都能到达/);
    selectOption(/不必——B2 因 O 关闭被拒/);

    const submit = screen.getByRole("button", {
      name: "提交三题预测并保存学习记录"
    });
    expect(submit).toBeDisabled();
    expect(
      screen.getByText("先保存本次运行，才能把三题预测与这条运行关联。")
    ).toBeInTheDocument();
  });

  it("保存后提交三题，只调用一次 saveLearning，并把恢复下标一并提交", async () => {
    await renderWorkbenchWithRun();
    await waitQuestions();

    // 先保存当前运行
    fireEvent.click(
      screen.getByRole("button", { name: "保存此配置的推演" })
    );
    await screen.findByText(/已保存运行 #record-fixed-id-001/);

    // 播放下标推进两次 → 提交时应带上 resumedEventIndex = 2
    fireEvent.click(screen.getByRole("button", { name: /下一步/ }));
    fireEvent.click(screen.getByRole("button", { name: /下一步/ }));

    selectOption(/能到达——路径 B 不受 D1 影响/);
    selectOption(/被阻断——D3 会把两条路径都拦截/);
    selectOption(/不必——B2 因 O 关闭被拒/);

    fireEvent.click(
      screen.getByRole("button", { name: "提交三题预测并保存学习记录" })
    );

    await waitFor(() => expect(saveLearningMock).toHaveBeenCalledTimes(1));
    expect(saveLearningMock).toHaveBeenCalledWith({
      runId: "record-fixed-id-001",
      predictions: { Q1: "0", Q2: "1", Q3: "0" },
      resumedEventIndex: 2
    });

    // 反馈逐题展示：2 题正确、1 题错误，并给出正确答案与条件依据
    await waitFor(() =>
      expect(screen.getAllByText(/回答正确/)).toHaveLength(2)
    );
    expect(screen.getAllByText(/回答错误/)).toHaveLength(1);
    expect(
      screen.getByText(/正确答案：C\. 未被阻断——A\/B 都能到达，并且出现告警/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /条件依据：D3 只记录告警、不阻断：A\/B 均到达，本次推演共产生 2 条告警。/
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(/学习记录已保存 #learning-fixed-id-001/)
    ).toBeInTheDocument();
  });

  it("题目加载失败时显示错误与重试；重试成功后渲染选项", async () => {
    getLearningQuestionsMock.mockRejectedValueOnce(new Error("题目接口失败"));
    await renderWorkbenchWithRun();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("题目接口失败");
    });
    getLearningQuestionsMock.mockResolvedValue(questionsFixture);
    fireEvent.click(screen.getByRole("button", { name: "重试" }));

    await waitQuestions();
  });

  it("提交失败时显示错误提示，不清空已选预测", async () => {
    await renderWorkbenchWithRun();
    await waitQuestions();
    fireEvent.click(
      screen.getByRole("button", { name: "保存此配置的推演" })
    );
    await screen.findByText(/已保存运行 #record-fixed-id-001/);

    saveLearningMock.mockRejectedValueOnce(new Error("写入失败"));
    selectOption(/能到达——路径 B 不受 D1 影响/);
    selectOption(/被阻断——D3 会把两条路径都拦截/);
    selectOption(/不必——B2 因 O 关闭被拒/);
    fireEvent.click(
      screen.getByRole("button", { name: "提交三题预测并保存学习记录" })
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("提交失败：写入失败")
    );
    expect(
      screen.getByRole("button", { name: /能到达——路径 B 不受 D1 影响/ })
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("记录页读回学习记录：显示预测、答案、反馈，并恢复保存的播放下标", async () => {
    const record = makeSavedRecord({
      scenarioId: "campus-registration",
      presetId: "A",
      conditions: { O: "open", T: "granted" },
      defenses: ["D1"]
    });
    const summary: RunSummary = {
      id: record.id,
      savedAt: record.savedAt,
      scenarioId: record.scenarioId,
      scenarioVersion: record.scenarioVersion,
      conditions: record.input.conditions,
      presetId: record.input.presetId,
      defenses: record.input.defenses,
      pathResults: record.result.pathResults as PathResult[],
      alertCount: record.result.alertCount
    };
    listRunsMock.mockResolvedValue([summary]);
    getRunMock.mockResolvedValue(record);
    getRunLearningMock.mockResolvedValue(
      makeLearningRecord(record.id, { Q1: "0", Q2: "1", Q3: "0" }, 3)
    );

    render(<App />);
    await screen.findByText("进入沙盘工作台");
    fireEvent.click(screen.getByRole("button", { name: "学习记录" }));

    const item = await screen.findByRole("button", {
      name: /O 开放 · T 有权限 · 防御 D1/
    });
    fireEvent.click(item);

    await waitFor(() =>
      expect(screen.getByText(/恢复播放下标 3/)).toBeInTheDocument()
    );
    expect(screen.getByText(/保存于 2026-11-04T10:20:40.000Z/)).toBeInTheDocument();
    expect(screen.getAllByText(/回答正确/)).toHaveLength(2);
    expect(
      screen.getByText(
        /条件依据：诊断页面对普通账号关闭，访问被拒绝/
      )
    ).toBeInTheDocument();
    // 原解释仍来自关联运行快照
    expect(
      screen.getByText(/路径 A 在 A3 被阻断，但路径 B 仍到达模拟数据。/)
    ).toBeInTheDocument();
  });

  it("该运行暂无学习记录时按正常空态展示，不显示错误", async () => {
    listRunsMock.mockResolvedValue([
      {
        id: "rec-no-learning",
        savedAt: "2026-11-04T10:20:30.000Z",
        scenarioId: "campus-registration",
        scenarioVersion: 1,
        conditions: { O: "open", T: "granted" },
        defenses: ["D1"],
        pathResults: [
          { pathId: "A", outcome: "blocked", firstBlockedStepId: "A3" },
          { pathId: "B", outcome: "reached" }
        ],
        alertCount: 0
      }
    ]);
    getRunMock.mockResolvedValue(makeSavedRecord({
      scenarioId: "campus-registration",
      conditions: { O: "open", T: "granted" },
      defenses: ["D1"]
    }));
    getRunLearningMock.mockResolvedValue(null);

    render(<App />);
    await screen.findByText("进入沙盘工作台");
    fireEvent.click(screen.getByRole("button", { name: "学习记录" }));

    const item = await screen.findByRole("button", {
      name: /O 开放 · T 有权限 · 防御 D1/
    });
    fireEvent.click(item);

    await waitFor(() =>
      expect(
        screen.getByText("这条运行还没有保存三题学习记录。")
      ).toBeInTheDocument()
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
