import type {
  ConditionCheck,
  DefenseId,
  OValue,
  PathFinalOutcome,
  PresetId,
  StepId,
  TValue
} from "./index.js";

/* ---------- 三题元数据（不含正确答案） ---------- */

export type LearningQuestionId = "Q1" | "Q2" | "Q3";

export interface LearningOption {
  id: string;
  text: string;
}

/**
 * 每题固定配置：服务器按这套配置独立推演，与工作台当前配置、
 * 与关联运行记录的 input 都无关。
 */
export interface LearningQuestionConfig {
  presetId: PresetId;
  conditions: {
    O: OValue;
    T: TValue;
  };
  defenses: DefenseId[];
}

/**
 * 下发给前端的题目元数据：只有题干、选项和固定配置，
 * 不含 correctOption（正确答案只在 POST /api/learning 的响应里出现）。
 */
export interface LearningQuestion {
  id: LearningQuestionId;
  prompt: string;
  options: LearningOption[];
  config: LearningQuestionConfig;
}

export interface ListLearningQuestionsResponse {
  questions: LearningQuestion[];
}

/* ---------- 确定性反馈 ---------- */

/** 该题固定配置推演出的引擎事实，供前端展示条件依据。 */
export interface LearningEngineEvidence {
  pathA: PathFinalOutcome;
  pathB: PathFinalOutcome;
  alertCount: number;
  blockedStepId: StepId | null;
  conditionCheck: ConditionCheck | null;
}

export interface LearningFeedback {
  questionId: LearningQuestionId;
  /** 由该题固定配置的引擎结果推出，不读前端提交值。 */
  correctOption: string;
  predictedOption: string | null;
  /** predictions[qid] === correctOption，逐题显式比较。 */
  isCorrect: boolean;
  conditionBasis: string;
  evidence: LearningEngineEvidence;
}

/* ---------- 学习记录 ---------- */

export interface LearningRecord {
  id: string;
  /** 关联的已保存运行；同一 runId 重复提交为覆盖。 */
  runId: string;
  savedAt: string;
  questions: LearningQuestion[];
  predictions: Record<LearningQuestionId, string>;
  feedbacks: LearningFeedback[];
  /** 恢复时的播放下标；可空（不记录恢复位置）。 */
  resumedEventIndex: number | null;
}

export interface SaveLearningRequest {
  runId: string;
  predictions: Record<LearningQuestionId, string>;
  resumedEventIndex?: number | null;
}

export type SaveLearningResponse = LearningRecord;
