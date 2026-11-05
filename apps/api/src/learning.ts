import type {
  LearningEngineEvidence,
  LearningFeedback,
  LearningQuestion,
  LearningQuestionId,
  PathFinalOutcome,
  RunInput,
  RunResult,
  Scenario
} from "@link-lab/contracts";
import { evaluateRun } from "@link-lab/engine";

/**
 * 手写正确答案先行固定，引擎推导只用于校验。
 * 若两者不一致，测试会失败并停下报告，不得改手写值去迁就推导结果。
 */
export const HANDWRITTEN_CORRECT_OPTIONS: Record<LearningQuestionId, string> = {
  Q1: "0",
  Q2: "2",
  Q3: "0"
};

/**
 * 三题元数据。每题固定一套配置：服务器按该配置独立推演，
 * 与工作台当前配置、与关联运行记录的 input 都无关。
 * 这里不含 correctOption，下发给前端时也不含。
 */
export const LEARNING_QUESTIONS: LearningQuestion[] = [
  {
    id: "Q1",
    prompt:
      "预设 A（O 开放、T 有权限）仅启用 D1 时，报名明细是否仍可到达？",
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
      {
        id: "0",
        text: "不必——B2 因 O 关闭被拒，后续步骤未执行，D1 已阻断路径 A"
      },
      { id: "1", text: "必须——否则路径 B 仍能到达报名明细" }
    ],
    config: {
      presetId: "B",
      conditions: { O: "closed", T: "granted" },
      defenses: ["D1"]
    }
  }
];

export interface QuestionDerivation {
  optionId: string;
  conditionBasis: string;
  evidence: LearningEngineEvidence;
}

function pathOutcome(result: RunResult, pathId: "A" | "B"): PathFinalOutcome {
  const found = result.pathResults.find((item) => item.pathId === pathId);
  if (!found) {
    throw new Error(`推演结果缺少路径 ${pathId} 的结论`);
  }
  return found.outcome;
}

function blockedStep(result: RunResult, pathId: "A" | "B") {
  return (
    result.pathResults.find((item) => item.pathId === pathId)?.firstBlockedStepId ??
    null
  );
}

function inputFor(scenario: Scenario, question: LearningQuestion): RunInput {
  return {
    scenarioId: scenario.id,
    presetId: question.config.presetId,
    conditions: { ...question.config.conditions },
    defenses: [...question.config.defenses]
  };
}

/**
 * 按该题固定配置推演并推导答案。
 * correctOption 完全来自引擎结果，不读前端提交值，也不读关联运行的 result。
 */
export function deriveQuestion(
  scenario: Scenario,
  questionId: LearningQuestionId
): QuestionDerivation {
  const question = LEARNING_QUESTIONS.find((item) => item.id === questionId);
  if (!question) {
    throw new Error(`未知题目：${questionId}`);
  }

  const result = evaluateRun(scenario, inputFor(scenario, question));
  const outcomeA = pathOutcome(result, "A");
  const outcomeB = pathOutcome(result, "B");

  if (questionId === "Q1") {
    const a3 = result.events.find(
      (event) => event.pathId === "A" && event.stepId === "A3"
    );
    const d1Check = a3?.conditionChecks.find((check) => check.id === "D1") ?? null;
    // 仅用于分支判断：D1 挡 A 且 B 无阻断、无告警 → 报名明细仍可到达
    const optionId =
      outcomeB === "reached" && result.alertCount === 0
        ? "0"
        : result.alertCount > 0
          ? "2"
          : "1";
    const conditionBasis =
      optionId === "0"
        ? `路径 A 被阻断：${d1Check?.reason ?? "未找到 D1 条件说明"}；路径 B 未命中阻断条件，最终到达报名明细。`
        : `路径 B 未到达报名明细；D1 条件说明：${d1Check?.reason ?? "未找到 D1 条件说明"}。`;

    return {
      optionId,
      conditionBasis,
      evidence: {
        pathA: outcomeA,
        pathB: outcomeB,
        alertCount: result.alertCount,
        blockedStepId: blockedStep(result, "A"),
        conditionCheck: d1Check
      }
    };
  }

  if (questionId === "Q2") {
    const bothReached = outcomeA === "reached" && outcomeB === "reached";
    const optionId = bothReached ? (result.alertCount > 0 ? "2" : "1") : "0";
    const conditionBasis = bothReached
      ? `D3 只记录告警、不阻断：A/B 均到达，本次推演共产生 ${result.alertCount} 条告警。`
      : `本次推演中至少一条路径被阻断，共产生 ${result.alertCount} 条告警。`;

    return {
      optionId,
      conditionBasis,
      evidence: {
        pathA: outcomeA,
        pathB: outcomeB,
        alertCount: result.alertCount,
        blockedStepId:
          blockedStep(result, "A") ?? blockedStep(result, "B"),
        conditionCheck: null
      }
    };
  }

  // Q3：不看字符串里的 "O"，直接取 B2 事件里 id === "O" 的条件检查
  const b2 = result.events.find(
    (event) => event.pathId === "B" && event.stepId === "B2"
  );
  const oCheck = b2?.conditionChecks.find((check) => check.id === "O") ?? null;
  const blockedByO = oCheck !== null && oCheck.satisfied === false;
  const optionId = blockedByO ? "0" : "1";
  // 条件依据文案直接取这条 check 的 reason，不另写死
  const conditionBasis = oCheck
    ? oCheck.reason
    : "推演结果未提供 B2 的 O 条件检查说明。";

  return {
    optionId,
    conditionBasis,
    evidence: {
      pathA: outcomeA,
      pathB: outcomeB,
      alertCount: result.alertCount,
      blockedStepId: blockedStep(result, "B"),
      conditionCheck: oCheck
    }
  };
}

/**
 * 用三题各自的固定配置推演并生成确定性反馈。
 * isCorrect 逐题显式比较 predictions[qid] === correctOption。
 */
export function buildLearningFeedback(
  scenario: Scenario,
  predictions: Record<string, string>
): LearningFeedback[] {
  return LEARNING_QUESTIONS.map((question) => {
    const derivation = deriveQuestion(scenario, question.id);
    const predicted = predictions[question.id] ?? null;
    return {
      questionId: question.id,
      correctOption: derivation.optionId,
      predictedOption: predicted,
      isCorrect: predicted === derivation.optionId,
      conditionBasis: derivation.conditionBasis,
      evidence: derivation.evidence
    };
  });
}

/** 校验前端提交的选项 id 是否都属于对应题目；不校验对错。 */
export function validatePredictions(
  predictions: Record<string, string>
): string | null {
  for (const question of LEARNING_QUESTIONS) {
    const selected = predictions[question.id];
    if (selected === undefined) {
      return `缺少题目 ${question.id} 的预测`;
    }
    if (!question.options.some((option) => option.id === selected)) {
      return `题目 ${question.id} 的选项 ${selected} 不存在`;
    }
  }
  return null;
}
