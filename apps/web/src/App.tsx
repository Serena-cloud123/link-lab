import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type {
  DefenseId,
  LearningFeedback,
  LearningQuestion,
  LearningQuestionId,
  LearningRecord,
  OValue,
  PathFinalOutcome,
  PresetId,
  RunInput,
  RunRecord,
  RunResult,
  RunSummary,
  SaveLearningRequest,
  Scenario,
  TValue
} from "@link-lab/contracts";
import {
  fetchScenario,
  getLearningQuestions,
  getRun,
  getRunLearning,
  listRuns,
  postEvaluation,
  saveLearning,
  saveRun
} from "./api";
import { ScenarioGraph } from "./components/ScenarioGraph";
import { RunResultPanel } from "./components/RunResultPanel";
import { PlaybackBar } from "./components/PlaybackBar";
import { CurrentEventPanel } from "./components/CurrentEventPanel";
import {
  BaselineComparisonPanel,
  type BaselineSnapshot
} from "./components/BaselineComparisonPanel";
import { derivePlaybackView } from "./playback";
import { oValueText, tValueText } from "./labels";

type PageId = "intro" | "workbench" | "records";
type Conditions = { O: OValue; T: TValue };

const pages: Array<{ id: PageId; label: string }> = [
  { id: "intro", label: "场景介绍" },
  { id: "workbench", label: "沙盘工作台" },
  { id: "records", label: "学习记录" }
];

type ScenarioState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; scenario: Scenario };

type RunState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "error"; message: string }
  | { status: "done"; result: RunResult; input: RunInput };

type BaselineState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "error"; message: string }
  | { status: "done"; snapshot: BaselineSnapshot };

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; record: RunRecord; runVersion: number }
  | { status: "error"; message: string; runVersion: number };

type RecordsListState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; summaries: RunSummary[] };

type QuestionsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; questions: LearningQuestion[] };

type QuizState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "done"; record: LearningRecord; runVersion: number }
  | { status: "error"; message: string; runVersion: number };

type SelectedLearningState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "none" }
  | { status: "error"; message: string }
  | { status: "done"; record: LearningRecord };

const EXPLANATION_SOURCE_LABELS: Record<RunRecord["explanationSource"], string> = {
  template: "规则模板"
};

function explanationSourceLabel(source: RunRecord["explanationSource"]): string {
  return EXPLANATION_SOURCE_LABELS[source] ?? source;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 固定 key 顺序的配置序列化，避免同一配置因对象 key 顺序不同被当成两个配置。
 * 防御数组按字典序排序后拼接，保证 ["D1","D2"] 与 ["D2","D1"] 等价。
 */
function serializeConfig(conditions: Conditions, defenses: DefenseId[]): string {
  return `O=${conditions.O};T=${conditions.T};D=[${[...defenses].sort().join(",")}]`;
}

const DEFENSE_ORDER: DefenseId[] = ["D1", "D2", "D3"];

export default function App() {
  const [page, setPage] = useState<PageId>("intro");
  const [scenarioState, setScenarioState] = useState<ScenarioState>({
    status: "loading"
  });
  const [presetId, setPresetId] = useState<PresetId>("A");
  const [conditions, setConditions] = useState<Conditions>({
    O: "open",
    T: "granted"
  });
  const [preview, setPreview] = useState<Conditions>({
    O: "open",
    T: "granted"
  });
  const [defenses, setDefenses] = useState<DefenseId[]>([]);
  const [runState, setRunState] = useState<RunState>({ status: "idle" });
  const [baselineState, setBaselineState] = useState<BaselineState>({
    status: "idle"
  });
  const [eventIndex, setEventIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [runEpoch, setRunEpoch] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });

  /* ---------- 记录页独立状态（与工作台隔离） ---------- */
  const [recordsList, setRecordsList] = useState<RecordsListState>({
    status: "idle"
  });
  const [selectedRecord, setSelectedRecord] = useState<RunRecord | null>(null);
  const [selectedEventIndex, setSelectedEventIndex] = useState(0);
  const [selectedPlaying, setSelectedPlaying] = useState(false);
  const [selectedRunEpoch, setSelectedRunEpoch] = useState(0);
  /** 每次切换记录递增，让在途 GET 详情响应被丢弃。 */
  const selectedFetchTokenRef = useRef(0);

  /* ---------- 三题与学习记录状态 ---------- */
  const [questionsState, setQuestionsState] = useState<QuestionsState>({
    status: "idle"
  });
  const [quizPredictions, setQuizPredictions] = useState<
    Partial<Record<LearningQuestionId, string>>
  >({});
  const [quizState, setQuizState] = useState<QuizState>({ status: "idle" });
  /** 提交学习记录的在途令牌，新一轮运行会作废旧响应。 */
  const quizTokenRef = useRef(0);
  const [selectedLearning, setSelectedLearning] =
    useState<SelectedLearningState>({ status: "idle" });

  /**
   * 动效开关初始值：
   *   - localStorage 有值则遵循（隐私模式读写会抛 SecurityError，try/catch 兜底）
   *   - 否则优先尊重系统 (prefers-reduced-motion: reduce)，默认开启。
   */
  const [animationsEnabled, setAnimationsEnabled] = useState<boolean>(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem("animationsEnabled");
    } catch {
      stored = null;
    }
    if (stored === "true") return true;
    if (stored === "false") return false;
    // 无持久化记录时，跟随系统设置
    try {
      return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      return true;
    }
  });

  type MediaQueryListener = (mql: MediaQueryList) => void;

  /** 订阅系统 prefers-reduced-motion 变化；cleanup 显式 removeEventListener。 */
  useEffect(() => {
    let query: MediaQueryList | null = null;
    let handler: ((e: MediaQueryListEvent | MediaQueryList) => void) | null = null;
    let hadError = false;
    try {
      query = window.matchMedia("(prefers-reduced-motion: reduce)");
      handler = (e) => {
        const matches =
          "matches" in e ? (e as MediaQueryListEvent).matches : (e as MediaQueryList).matches;
        if (matches) setAnimationsEnabled(false);
      };
      const q = query;
      if (q && "addEventListener" in q && typeof q.addEventListener === "function") {
        q.addEventListener("change", handler as (e: MediaQueryListEvent) => void);
      } else if (q && typeof (q as MediaQueryList & { addListener?: MediaQueryListener }).addListener === "function") {
        (q as MediaQueryList & { addListener: MediaQueryListener }).addListener(handler);
      }
    } catch {
      hadError = true;
    }
    return () => {
      if (hadError || !query || !handler) return;
      try {
        const q = query;
        if ("removeEventListener" in q && typeof q.removeEventListener === "function") {
          q.removeEventListener("change", handler as (e: MediaQueryListEvent) => void);
        } else if (typeof (q as MediaQueryList & { removeListener?: MediaQueryListener }).removeListener === "function") {
          (q as MediaQueryList & { removeListener: MediaQueryListener }).removeListener(handler);
        }
      } catch {
        // 忽略 cleanup 异常
      }
    };
  }, []);

  function toggleAnimations() {
    setAnimationsEnabled((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem("animationsEnabled", next ? "true" : "false");
      } catch {
        // 隐私模式或禁用存储时静默忽略
      }
      return next;
    });
  }

  // 同步真值（refs），state 仅作为渲染镜像
  const scenarioRef = useRef<Scenario | null>(null);
  const presetIdRef = useRef<PresetId>("A");
  const conditionsRef = useRef<Conditions>({ O: "open", T: "granted" });
  const previewRef = useRef<Conditions>({ O: "open", T: "granted" });
  const defensesRef = useRef<DefenseId[]>([]);
  const submittedConfigRef = useRef<string>("");
  const runVersionRef = useRef(0);
  const runningRef = useRef(false);
  const mountedRef = useRef(true);
  // 保存轨道：token 标记最近一次有效保存请求；新一轮运行/切预设/场景重载都会使其作废
  const saveTokenRef = useRef(0);
  const saveInFlightRef = useRef(false);
  // 基线独立轨道：版本号 + 在途标记，与当前运行互不相干
  const baselineVersionRef = useRef(0);
  const baselineInFlightRef = useRef(false);

  const loadScenario = useCallback(async () => {
    setScenarioState({ status: "loading" });
    // 场景重载时旧基线一律失效
    baselineVersionRef.current++;
    baselineInFlightRef.current = false;
    setBaselineState({ status: "idle" });
    // 场景重载时在途保存响应一并作废
    invalidateSave();
    resetPlayback();
    // 场景重载递增 runEpoch，让所有旧动画 DOM 卸载
    setRunEpoch((e) => e + 1);
    try {
      const scenario = await fetchScenario();
      scenarioRef.current = scenario;
      // 用预设 A 初始化条件（与场景保持一致）
      const presetA = scenario.presets.find((p) => p.id === "A");
      if (presetA) {
        const init: Conditions = { ...presetA.conditions };
        presetIdRef.current = "A";
        conditionsRef.current = { ...init };
        previewRef.current = { ...init };
        setPresetId("A");
        setConditions({ ...init });
        setPreview({ ...init });
      }
      if (mountedRef.current) {
        setScenarioState({ status: "ready", scenario });
      }
    } catch (error) {
      if (mountedRef.current) {
        setScenarioState({ status: "error", message: errorMessage(error) });
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void loadScenario();
    return () => {
      mountedRef.current = false;
    };
  }, [loadScenario]);

  const scenario =
    scenarioState.status === "ready" ? scenarioState.scenario : null;
  const running = runState.status === "running";

  /** 使基线立即失效：在途响应由版本号闸门丢弃，不会被恢复。 */
  function invalidateBaseline() {
    baselineVersionRef.current++;
    baselineInFlightRef.current = false;
    setBaselineState({ status: "idle" });
  }

  /** 使在途保存响应与保存展示失效：新运行、切预设、场景重载时调用。 */
  function invalidateSave() {
    saveTokenRef.current++;
    setSaveState({ status: "idle" });
    // 学习记录关联的是一次具体运行，运行失效时预测与反馈一并清空
    quizTokenRef.current++;
    setQuizState({ status: "idle" });
    setQuizPredictions({});
  }

  /** 播放状态统一重置：暂停并回 0。只在 run()、handleSelectPreset()、loadScenario() 调用。 */
  function resetPlayback() {
    setPlaying(false);
    setEventIndex(0);
  }

  /**
   * 唯一的当前运行 POST 入口。始终用参数 nextConditions / nextDefenses 显式构造
   * input，不依赖可能滞后的 state。O/T 变化时同步使旧基线失效。
   */
  async function run(nextConditions: Conditions, nextDefenses: DefenseId[]) {
    if (runningRef.current) return;
    const scenario = scenarioRef.current;
    if (!scenario) return;

    // 新一轮运行开始：在途保存响应作废，避免旧保存归属到新配置
    invalidateSave();

    // 提交任何新运行都使旧播放状态失效
    resetPlayback();

    // 先与提交前的 O/T 比对：只有初始条件变化才使基线失效，切防御不失效
    const prev = conditionsRef.current;
    const conditionsChanged =
      prev.O !== nextConditions.O || prev.T !== nextConditions.T;
    if (conditionsChanged) invalidateBaseline();

    const version = ++runVersionRef.current;
    const nextSerialized = serializeConfig(nextConditions, nextDefenses);

    // 同步更新 ref 真值与 submittedConfig（第二道门）
    submittedConfigRef.current = nextSerialized;
    conditionsRef.current = { ...nextConditions };
    defensesRef.current = [...nextDefenses];
    runningRef.current = true;

    // 同步渲染镜像
    setConditions({ ...nextConditions });
    setDefenses([...nextDefenses]);
    setRunState({ status: "running" });

    // 显式构造 input，key 顺序固定
    const input: RunInput = {
      scenarioId: scenario.id,
      presetId: presetIdRef.current,
      conditions: { O: nextConditions.O, T: nextConditions.T },
      defenses: [...nextDefenses]
    };

    try {
      const result = await postEvaluation(input);
      if (version !== runVersionRef.current || !mountedRef.current) return;
      // 新响应到达：runEpoch 递增让所有旧动画 DOM 卸载重建
      setRunEpoch((e) => e + 1);
      setRunState({ status: "done", result, input });
      // 本次就是无防御运行：把这份真实 input+result 直接作为同条件基线
      if (nextDefenses.length === 0) {
        baselineVersionRef.current++;
        baselineInFlightRef.current = false;
        setBaselineState({
          status: "done",
          snapshot: {
            scenarioId: scenario.id,
            scenarioVersion: scenario.version,
            conditions: { O: nextConditions.O, T: nextConditions.T },
            input,
            result
          }
        });
      }
    } catch (error) {
      if (version !== runVersionRef.current || !mountedRef.current) return;
      setRunState({ status: "error", message: errorMessage(error) });
    } finally {
      if (version === runVersionRef.current) {
        runningRef.current = false;
      }
    }
  }

  /**
   * 补跑当前 O/T 的无防御基线。独立轨道：只写 baselineState，
   * 不改防御开关、不覆盖当前干预结果，一次点击只发一次请求。
   */
  async function runBaseline() {
    if (baselineInFlightRef.current || runningRef.current) return;
    const scenario = scenarioRef.current;
    if (!scenario) return;

    const version = ++baselineVersionRef.current;
    baselineInFlightRef.current = true;
    const conds = { ...conditionsRef.current };
    setBaselineState({ status: "running" });

    const input: RunInput = {
      scenarioId: scenario.id,
      presetId: presetIdRef.current,
      conditions: { O: conds.O, T: conds.T },
      defenses: []
    };

    try {
      const result = await postEvaluation(input);
      // 版本号 + 当前 O/T 双重校验：过期响应绝不恢复旧基线
      if (version !== baselineVersionRef.current || !mountedRef.current) return;
      const now = conditionsRef.current;
      if (now.O !== conds.O || now.T !== conds.T) return;
      setBaselineState({
        status: "done",
        snapshot: {
          scenarioId: scenario.id,
          scenarioVersion: scenario.version,
          conditions: { O: conds.O, T: conds.T },
          input,
          result
        }
      });
    } catch (error) {
      if (version !== baselineVersionRef.current || !mountedRef.current) return;
      const now = conditionsRef.current;
      if (now.O !== conds.O || now.T !== conds.T) return;
      setBaselineState({ status: "error", message: errorMessage(error) });
    } finally {
      if (version === baselineVersionRef.current) {
        baselineInFlightRef.current = false;
      }
    }
  }

  /**
   * 滑块释放时提交。两道门：
   * 1. preview === conditions（拖回原位）→ 0 POST；
   * 2. 序列化后与 submittedConfigRef 相同（mouseup + blur 重复）→ 0 POST。
   * 第二道门在第一道门之后，实际不会拦截合法重跑（手动运行走 run() 直达）。
   */
  function commitConditions() {
    const p = previewRef.current;
    const c = conditionsRef.current;
    if (p.O === c.O && p.T === c.T) return;
    const key = serializeConfig(p, defensesRef.current);
    if (key === submittedConfigRef.current) return;
    void run(p, defensesRef.current);
  }

  // 拖动过程仅更新预览，不发 POST
  function handleSliderInput(cond: "O" | "T", rawValue: number) {
    const value: OValue | TValue =
      cond === "O"
        ? rawValue === 0
          ? "open"
          : "closed"
        : rawValue === 0
          ? "granted"
          : "revoked";
    const next: Conditions = { ...previewRef.current, [cond]: value };
    previewRef.current = next; // 同步写 ref，不等 useEffect
    setPreview(next);
  }

  function toggleDefense(id: DefenseId) {
    if (runningRef.current) return;
    const current = defensesRef.current;
    const next = current.includes(id)
      ? current.filter((d) => d !== id)
      : [...current, id];
    defensesRef.current = next; // 同步写 ref
    setDefenses(next);
    void run(conditionsRef.current, next);
  }

  function handleManualRun() {
    // 手动运行绕过 no-op 检查，允许重跑同一配置
    void run(conditionsRef.current, defensesRef.current);
  }

  /* ---------- 记录页：列表加载与记录选择 ---------- */

  /** 加载历史列表。只在 page === "records" 时调用。 */
  async function fetchRecordsList() {
    setRecordsList({ status: "loading" });
    try {
      const summaries = await listRuns();
      if (!mountedRef.current) return;
      setRecordsList({ status: "done", summaries });
    } catch (error) {
      if (!mountedRef.current) return;
      setRecordsList({ status: "error", message: errorMessage(error) });
    }
  }

  /** 点击历史列表中的一条 → 拉详情，独立于工作台。 */
  async function handleSelectRecord(id: string) {
    // 取消上一条在途详情请求与学习记录请求
    const token = ++selectedFetchTokenRef.current;
    setSelectedRecord(null);
    setSelectedEventIndex(0);
    setSelectedPlaying(false);
    setSelectedRunEpoch((e) => e + 1);
    setSelectedLearning({ status: "loading" });

    try {
      const record = await getRun(id);
      if (token !== selectedFetchTokenRef.current) return; // 已切到下一条
      if (!mountedRef.current) return;
      setSelectedRecord(record);
      void loadSelectedLearning(id, token, record.result.events.length);
    } catch (error) {
      if (token !== selectedFetchTokenRef.current) return;
      if (!mountedRef.current) return;
      // 详情加载失败时清除选中
      setSelectedRecord(null);
      setSelectedLearning({ status: "idle" });
      console.error("加载运行详情失败：", error);
    }
  }

  /**
   * 读取记录关联的学习记录。
   * 「该运行暂无学习记录」是正常空态（api 层返回 null），不是错误。
   */
  async function loadSelectedLearning(
    runId: string,
    token: number,
    eventsCount: number
  ) {
    try {
      const record = await getRunLearning(runId);
      if (token !== selectedFetchTokenRef.current) return;
      if (!mountedRef.current) return;
      if (!record) {
        setSelectedLearning({ status: "none" });
        return;
      }
      setSelectedLearning({ status: "done", record });
      // 恢复保存学习记录时的播放下标（夹在有效范围内）
      if (record.resumedEventIndex !== null && eventsCount > 0) {
        setSelectedEventIndex(
          Math.min(Math.max(record.resumedEventIndex, 0), eventsCount - 1)
        );
      }
    } catch (error) {
      if (token !== selectedFetchTokenRef.current) return;
      if (!mountedRef.current) return;
      setSelectedLearning({ status: "error", message: errorMessage(error) });
    }
  }

  /* ---------- 三题：加载、作答与提交 ---------- */

  async function fetchLearningQuestions() {
    setQuestionsState({ status: "loading" });
    try {
      const questions = await getLearningQuestions();
      if (!mountedRef.current) return;
      setQuestionsState({ status: "done", questions });
    } catch (error) {
      if (!mountedRef.current) return;
      setQuestionsState({ status: "error", message: errorMessage(error) });
    }
  }

  function handlePredict(questionId: LearningQuestionId, optionId: string) {
    if (quizState.status === "saving") return;
    setQuizPredictions((prev) => ({ ...prev, [questionId]: optionId }));
  }

  async function handleSubmitLearning() {
    if (saveState.status !== "saved") return;
    if (questionsState.status !== "done") return;
    if (quizState.status === "saving") return;

    const missing = questionsState.questions.some(
      (question) => quizPredictions[question.id] === undefined
    );
    if (missing) return;

    const targetRunVersion = saveState.runVersion;
    if (targetRunVersion !== runVersionRef.current) return;

    const token = ++quizTokenRef.current;
    setQuizState({ status: "saving" });

    const request: SaveLearningRequest = {
      runId: saveState.record.id,
      predictions: {
        Q1: quizPredictions.Q1!,
        Q2: quizPredictions.Q2!,
        Q3: quizPredictions.Q3!
      },
      resumedEventIndex: eventIndex
    };

    try {
      const record = await saveLearning(request);
      if (token !== quizTokenRef.current) return;
      if (!mountedRef.current) return;
      if (targetRunVersion !== runVersionRef.current) return;
      setQuizState({
        status: "done",
        record,
        runVersion: targetRunVersion
      });
    } catch (error) {
      if (token !== quizTokenRef.current) return;
      if (!mountedRef.current) return;
      if (targetRunVersion !== runVersionRef.current) return;
      setQuizState({
        status: "error",
        message: errorMessage(error),
        runVersion: targetRunVersion
      });
    }
  }

  /** 进入工作台且场景就绪时加载一次题目元数据。 */
  useEffect(() => {
    if (page !== "workbench" || scenarioState.status !== "ready") return;
    if (questionsState.status !== "idle") return;
    void fetchLearningQuestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, scenarioState.status, questionsState.status]);

  /**
   * page 切换 effect：
   * - 进入 records → 加载列表 + 暂停工作台播放
   * - 离开 records → 清除选中 + 递增 runEpoch 让旧播放定时器自毁
   */
  useEffect(() => {
    if (page === "records") {
      setPlaying(false); // 暂停工作台播放
      void fetchRecordsList();
    } else {
      // 离开 records 页：清理独立回放上下文，不污染工作台状态
      setSelectedRecord(null);
      setSelectedPlaying(false);
      setSelectedRunEpoch((e) => e + 1);
      setSelectedLearning({ status: "idle" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  /** 独立的 selected playing 定时器（与工作台的 playing/eventIndex 完全隔离）。 */
  useEffect(() => {
    if (!selectedPlaying || !selectedRecord) return;
    const events = selectedRecord.result.events;
    if (selectedEventIndex >= events.length - 1) {
      setSelectedPlaying(false);
      return;
    }
    const id = window.setInterval(() => {
      setSelectedEventIndex((prev) => {
        if (prev >= events.length - 1) {
          window.clearInterval(id);
          setSelectedPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 800);
    return () => window.clearInterval(id);
  }, [selectedPlaying, selectedEventIndex, selectedRecord, selectedRunEpoch]);

  /* ---------- 题目展示辅助 ---------- */

  function questionConfigText(question: LearningQuestion): string {
    const defenseText =
      question.config.defenses.length > 0
        ? `防御 ${question.config.defenses.join("、")}`
        : "无防御";
    return `预设 ${question.config.presetId} · O ${oValueText[question.config.conditions.O]} · T ${tValueText[question.config.conditions.T]} · ${defenseText}`;
  }

  function optionTextOf(
    questions: LearningQuestion[],
    questionId: LearningQuestionId,
    optionId: string | null
  ): string {
    if (optionId === null) return "未作答";
    const question = questions.find((item) => item.id === questionId);
    const option = question?.options.find((item) => item.id === optionId);
    return option ? `${option.id}. ${option.text}` : optionId;
  }

  function outcomeText(outcome: PathFinalOutcome): string {
    return outcome === "reached" ? "到达" : "阻断";
  }

  function renderFeedbackList(
    questions: LearningQuestion[],
    feedbacks: LearningFeedback[]
  ): ReactNode {
    return (
      <ul className="learning-feedbacks">
        {feedbacks.map((feedback) => (
          <li
            key={feedback.questionId}
            className={
              feedback.isCorrect ? "feedback-correct" : "feedback-incorrect"
            }
          >
            <p>
              <strong>{feedback.questionId}</strong> ·{" "}
              {feedback.isCorrect ? "回答正确" : "回答错误"}
            </p>
            <p>
              你的预测：
              {optionTextOf(
                questions,
                feedback.questionId,
                feedback.predictedOption
              )}
            </p>
            <p>
              正确答案：
              {optionTextOf(
                questions,
                feedback.questionId,
                feedback.correctOption
              )}
            </p>
            <p>条件依据：{feedback.conditionBasis}</p>
            <p className="hint">
              引擎事实（按本题固定配置推演）：路径 A{" "}
              {outcomeText(feedback.evidence.pathA)} · 路径 B{" "}
              {outcomeText(feedback.evidence.pathB)} · 告警{" "}
              {feedback.evidence.alertCount} 条
              {feedback.evidence.blockedStepId
                ? ` · 首个阻断步骤 ${feedback.evidence.blockedStepId}`
                : ""}
            </p>
          </li>
        ))}
      </ul>
    );
  }

  /* ---------- 记录页播放控制（独立函数，复用 PlaybackBar） ---------- */

  function selectedNodeLabel(id: string, recordVersionMatches: boolean): string {
    if (!recordVersionMatches) {
      // 版本不一致：不查当前场景的中文标签，直接返回 nodeId
      return id;
    }
    return scenarioRef.current?.nodes.find((n) => n.id === id)?.label ?? id;
  }

  function selectedHandleJump(index: number) {
    setSelectedPlaying(false);
    setSelectedEventIndex(index);
  }
  function selectedHandleNext() {
    setSelectedPlaying(false);
    if (!selectedRecord) return;
    const count = selectedRecord.result.events.length;
    setSelectedEventIndex((prev) =>
      count === 0 ? 0 : Math.min(prev + 1, count - 1)
    );
  }
  function selectedHandlePrev() {
    setSelectedPlaying(false);
    setSelectedEventIndex((prev) => Math.max(prev - 1, 0));
  }
  function selectedHandlePlayPause() {
    if (!selectedRecord) return;
    const count = selectedRecord.result.events.length;
    if (count === 0) return;
    if (selectedEventIndex >= count - 1) {
      setSelectedEventIndex(0);
      setSelectedPlaying(true);
      return;
    }
    setSelectedPlaying((prev) => !prev);
  }

  /**
   * 显式保存当前成功运行。只发送该次 runState.input 快照；
   * 响应返回时若 token/runVersion 已变（新运行、切预设、场景重载），静默丢弃。
   */
  async function handleSaveRun() {
    if (runState.status !== "done") return;
    if (saveInFlightRef.current) return;
    const input = runState.input;
    const version = runVersionRef.current;
    const token = ++saveTokenRef.current;
    saveInFlightRef.current = true;
    setSaveState({ status: "saving" });
    try {
      const record = await saveRun(input);
      if (token !== saveTokenRef.current || version !== runVersionRef.current) return;
      if (!mountedRef.current) return;
      setSaveState({ status: "saved", record, runVersion: version });
      // 新保存记录对应新的 runId，旧一轮学习反馈作废（预测保留）
      quizTokenRef.current++;
      setQuizState({ status: "idle" });
    } catch (error) {
      if (token !== saveTokenRef.current || version !== runVersionRef.current) return;
      if (!mountedRef.current) return;
      setSaveState({
        status: "error",
        message: errorMessage(error),
        runVersion: version
      });
    } finally {
      saveInFlightRef.current = false;
    }
  }

  function handleSelectPreset(id: PresetId) {
    if (runningRef.current) return;
    const scenario = scenarioRef.current;
    if (!scenario) return;
    const preset = scenario.presets.find((p) => p.id === id);
    if (!preset) return;

    // 使在途响应失效
    runVersionRef.current++;
    runningRef.current = false;
    // 切预设：在途保存响应作废
    invalidateSave();
    // 切预设是另一条基线失效路径
    invalidateBaseline();
    // 切预设使播放失效 + runEpoch 递增让动画 DOM 卸载
    resetPlayback();
    setRunEpoch((e) => e + 1);

    // 同步重置所有 ref
    const init: Conditions = { ...preset.conditions };
    presetIdRef.current = id;
    conditionsRef.current = { ...init };
    previewRef.current = { ...init };
    defensesRef.current = [];
    submittedConfigRef.current = "";

    // 同步渲染镜像
    setPresetId(id);
    setConditions({ ...init });
    setPreview({ ...init });
    setDefenses([]);
    setRunState({ status: "idle" });
  }

  // --- 播放控制 ---

  const events =
    runState.status === "done" ? runState.result.events : [];
  const eventsCount = events.length;

  // 800ms 自动推进下标；到末尾自动停止；组件卸载/暂停/换配置 cleanup 清定时器
  useEffect(() => {
    if (!playing || eventsCount === 0) return;
    if (eventIndex >= eventsCount - 1) {
      setPlaying(false);
      return;
    }
    const id = window.setInterval(() => {
      setEventIndex((prev) => {
        if (prev >= eventsCount - 1) {
          window.clearInterval(id);
          setPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 800);
    return () => window.clearInterval(id);
  }, [playing, eventIndex, eventsCount]);

  const playbackView =
    runState.status === "done"
      ? derivePlaybackView(runState.result, eventIndex)
      : null;

  function nodeLabel(id: string): string {
    return scenarioRef.current?.nodes.find((n) => n.id === id)?.label ?? id;
  }

  function handleJump(index: number) {
    setPlaying(false);
    setEventIndex(index);
  }

  function handleNext() {
    setPlaying(false);
    setEventIndex((prev) =>
      eventsCount === 0 ? 0 : Math.min(prev + 1, eventsCount - 1)
    );
  }

  function handlePrev() {
    setPlaying(false);
    setEventIndex((prev) => Math.max(prev - 1, 0));
  }

  function handlePlayPause() {
    if (eventsCount === 0) return;
    if (eventIndex >= eventsCount - 1) {
      // 到末尾按播放：回到 0 再播
      setEventIndex(0);
      setPlaying(true);
      return;
    }
    setPlaying((prev) => !prev);
  }

  let content: ReactNode;
  if (page === "records") {
    const scenarioReady = scenarioState.status === "ready";
    const currentScenario = scenarioState.status === "ready" ? scenarioState.scenario : null;
    const summaries = recordsList.status === "done" ? recordsList.summaries : [];
    const hasRecords = summaries.length > 0;

    // 版本匹配判定
    const versionMatches =
      selectedRecord !== null &&
      currentScenario !== null &&
      selectedRecord.scenarioId === currentScenario.id &&
      selectedRecord.scenarioVersion === currentScenario.version;

    const selectedEvents = selectedRecord?.result.events ?? [];
    const selectedEventsCount = selectedEvents.length;
    const selectedPlaybackView =
      selectedRecord !== null ? derivePlaybackView(selectedRecord.result, selectedEventIndex) : null;

    content = (
      <section className="records-grid" aria-label="学习记录">
        <aside className="panel records-list-panel" aria-label="历史列表">
          <h2>学习记录</h2>
          {recordsList.status === "loading" ? (
            <p className="notice">正在加载历史列表…</p>
          ) : recordsList.status === "error" ? (
            <div className="notice error" role="alert">
              <p>加载失败：{recordsList.message}</p>
              <button type="button" onClick={() => void fetchRecordsList()}>
                重试
              </button>
            </div>
          ) : !hasRecords ? (
            <div className="records-empty">
              <p>暂无保存的运行。</p>
              <p className="hint">去沙盘工作台运行一次配置并点击「保存此配置的推演」，之后这里会列出你的学习记录。</p>
            </div>
          ) : (
            <ul className="records-list" role="listbox" aria-label="历史运行列表">
              {summaries.map((sum) => {
                const isSelected = selectedRecord?.id === sum.id;
                return (
                  <li key={sum.id}>
                    <button
                      type="button"
                      className={`record-item ${isSelected ? "selected" : ""}`}
                      onClick={() => void handleSelectRecord(sum.id)}
                      aria-current={isSelected ? "true" : undefined}
                    >
                      <span className="record-time">{sum.savedAt}</span>
                      <span className="record-config">
                        O {oValueText[sum.conditions.O]} · T {tValueText[sum.conditions.T]}
                        {sum.defenses.length > 0
                          ? ` · 防御 ${sum.defenses.join("、")}`
                          : " · 无防御"}
                      </span>
                      <span className="record-result">
                        A {sum.pathResults.find((p) => p.pathId === "A")?.outcome}
                        {" · "}
                        B {sum.pathResults.find((p) => p.pathId === "B")?.outcome}
                        {sum.alertCount > 0 ? ` · ${sum.alertCount} 告警` : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <section className="panel records-playback-panel" aria-label="历史回放">
          <h2>回放视图</h2>
          {selectedRecord === null ? (
            <p className="notice">点击左侧一条历史运行以回放其事件。</p>
          ) : !scenarioReady ? (
            <p className="notice">场景尚未加载完成，无法回放。</p>
          ) : !versionMatches ? (
            <>
              <div className="version-mismatch-warning" role="alert">
                <p>⚠️ 当前场景版本与该记录的场景版本不一致（记录 v{selectedRecord.scenarioVersion} · 当前 v{currentScenario!.version}）。</p>
                <p className="hint">仅显示事件文字回放，无法用当前场景画布还原。节点显示使用记录中的原始 ID。</p>
              </div>
              <CurrentEventPanel
                result={selectedRecord.result}
                eventIndex={selectedEventIndex}
                nodeLabel={(id) => selectedNodeLabel(id, false)}
              />
              <PlaybackBar
                eventsCount={selectedEventsCount}
                eventIndex={selectedEventIndex}
                playing={selectedPlaying}
                animationsEnabled={animationsEnabled}
                onAnimationsToggle={toggleAnimations}
                onJump={selectedHandleJump}
                onNext={selectedHandleNext}
                onPrev={selectedHandlePrev}
                onPlayPause={selectedHandlePlayPause}
              />
            </>
          ) : (
            <>
              <ScenarioGraph
                scenario={currentScenario!}
                view={selectedPlaybackView}
                animationsEnabled={animationsEnabled}
                runEpoch={selectedRunEpoch}
              />
              <CurrentEventPanel
                result={selectedRecord.result}
                eventIndex={selectedEventIndex}
                nodeLabel={(id) => selectedNodeLabel(id, true)}
              />
              <PlaybackBar
                eventsCount={selectedEventsCount}
                eventIndex={selectedEventIndex}
                playing={selectedPlaying}
                animationsEnabled={animationsEnabled}
                onAnimationsToggle={toggleAnimations}
                onJump={selectedHandleJump}
                onNext={selectedHandleNext}
                onPrev={selectedHandlePrev}
                onPlayPause={selectedHandlePlayPause}
              />
              <div className="record-explanation">
                <h3>原始解释（{explanationSourceLabel(selectedRecord.explanationSource)}）</h3>
                <p>{selectedRecord.explanation}</p>
              </div>
            </>
          )}
          {selectedRecord !== null ? (
            <div className="record-learning" aria-label="学习记录">
              <h3>学习记录</h3>
              {selectedLearning.status === "loading" ? (
                <p className="notice">正在读取学习记录…</p>
              ) : null}
              {selectedLearning.status === "none" ? (
                <p className="hint">这条运行还没有保存三题学习记录。</p>
              ) : null}
              {selectedLearning.status === "error" ? (
                <p className="notice error" role="alert">
                  学习记录读取失败：{selectedLearning.message}
                </p>
              ) : null}
              {selectedLearning.status === "done" ? (
                <>
                  <p className="hint">
                    保存于 {selectedLearning.record.savedAt} · 恢复播放下标{" "}
                    {selectedLearning.record.resumedEventIndex === null
                      ? "未记录"
                      : selectedLearning.record.resumedEventIndex}
                  </p>
                  {renderFeedbackList(
                    selectedLearning.record.questions,
                    selectedLearning.record.feedbacks
                  )}
                </>
              ) : null}
            </div>
          ) : null}
        </section>
      </section>
    );
  } else if (scenarioState.status === "loading") {
    content = <p className="notice">正在加载场景…</p>;
  } else if (scenarioState.status === "error") {
    content = (
      <div className="notice error" role="alert">
        <p>场景加载失败：{scenarioState.message}</p>
        <button type="button" onClick={() => void loadScenario()}>
          重试
        </button>
      </div>
    );
  } else if (page === "intro") {
    const ready = scenarioState.scenario;
    content = (
      <section aria-labelledby="intro-title">
        <h1 id="intro-title">{ready.title}</h1>
        <div className="boundary">
          <h2>模型边界</h2>
          <p>{ready.boundary}</p>
        </div>
        <h2>学习目标</h2>
        <ol className="goals">
          <li>判断一条攻击路径继续推进需要哪些条件。</li>
          <li>区分“检测到请求”和“阻断了请求”。</li>
          <li>解释阻断一条路径后，为什么仍可能存在另一条路径。</li>
        </ol>
        <button
          type="button"
          className="run-button enter"
          onClick={() => setPage("workbench")}
        >
          进入沙盘工作台
        </button>
      </section>
    );
  } else {
    const ready = scenarioState.scenario;
    const preset =
      ready.presets.find((item) => item.id === presetId) ?? null;
    const adjusted = preset
      ? conditions.O !== preset.conditions.O ||
        conditions.T !== preset.conditions.T ||
        defenses.length > 0
      : false;

    const baselineSnapshot =
      baselineState.status === "done" ? baselineState.snapshot : null;
    // 资格只取场景 ID、场景版本、O、T；presetId 不参与
    const baselineMatches =
      baselineSnapshot !== null &&
      baselineSnapshot.scenarioId === ready.id &&
      baselineSnapshot.scenarioVersion === ready.version &&
      baselineSnapshot.conditions.O === conditions.O &&
      baselineSnapshot.conditions.T === conditions.T;
    const baselineRunning = baselineState.status === "running";
    const hasDefenses = defenses.length > 0;

    content = (
      <section className="workbench-grid" aria-label="沙盘工作台">
        <aside className="panel config-panel" aria-label="运行配置">
          <h2>运行配置</h2>
          <div className="preset-group" role="group" aria-label="预设">
            {ready.presets.map((item) => (
              <button
                key={item.id}
                type="button"
                className={item.id === presetId ? "preset active" : "preset"}
                disabled={running}
                onClick={() => handleSelectPreset(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          {preset && adjusted ? (
            <p className="adjust-hint">
              从预设 {preset.id} 调整（O {oValueText[conditions.O]} · T{" "}
              {tValueText[conditions.T]}
              {defenses.length > 0 ? ` · 防御 ${defenses.join("、")}` : ""}）
            </p>
          ) : null}

          <div className="condition-sliders">
            <div className="slider-row">
              <label htmlFor="o-slider">{ready.initialConditions.O.label}</label>
              <input
                id="o-slider"
                type="range"
                min={0}
                max={1}
                step={1}
                value={preview.O === "open" ? 0 : 1}
                disabled={running}
                aria-valuetext={oValueText[preview.O]}
                onInput={(e) =>
                  handleSliderInput("O", Number((e.target as HTMLInputElement).value))
                }
                onMouseUp={commitConditions}
                onKeyUp={commitConditions}
                onTouchEnd={commitConditions}
                onBlur={commitConditions}
              />
              <span className="slider-value">{oValueText[preview.O]}</span>
            </div>
            <div className="slider-row">
              <label htmlFor="t-slider">{ready.initialConditions.T.label}</label>
              <input
                id="t-slider"
                type="range"
                min={0}
                max={1}
                step={1}
                value={preview.T === "granted" ? 0 : 1}
                disabled={running}
                aria-valuetext={tValueText[preview.T]}
                onInput={(e) =>
                  handleSliderInput("T", Number((e.target as HTMLInputElement).value))
                }
                onMouseUp={commitConditions}
                onKeyUp={commitConditions}
                onTouchEnd={commitConditions}
                onBlur={commitConditions}
              />
              <span className="slider-value">{tValueText[preview.T]}</span>
            </div>
          </div>

          <div className="defense-group" role="group" aria-label="防御措施">
            {DEFENSE_ORDER.map((id) => {
              const def = ready.defenses[id];
              const active = defenses.includes(id);
              const isD3 = id === "D3";
              return (
                <button
                  key={id}
                  type="button"
                  className={`defense-toggle ${active ? "active" : ""} ${
                    isD3 ? "d3" : ""
                  }`}
                  disabled={running}
                  aria-pressed={active}
                  onClick={() => toggleDefense(id)}
                >
                  <span className="defense-id">{id}</span>
                  <span className="defense-label">{def.label}</span>
                  <span className="defense-type">
                    {isD3 ? "记录告警" : "阻断"}
                  </span>
                </button>
              );
            })}
          </div>

          {hasDefenses ? (
            baselineRunning ? (
              <p className="baseline-prompt">正在运行当前条件的无防御基线…</p>
            ) : baselineMatches ? null : (
              <div className="baseline-prompt">
                <p>
                  当前 O/T 尚无无防御基线，无法对比。补跑一次不会改变防御开关，也不会覆盖当前结果。
                </p>
                <button
                  type="button"
                  className="baseline-button"
                  disabled={running}
                  onClick={() => void runBaseline()}
                >
                  运行当前条件的无防御基线
                </button>
                {baselineState.status === "error" ? (
                  <p className="baseline-error" role="alert">
                    基线运行失败：{baselineState.message}
                  </p>
                ) : null}
              </div>
            )
          ) : null}

          <button
            type="button"
            className="run-button"
            disabled={running || !preset}
            onClick={handleManualRun}
          >
            {running ? "正在运行…" : "运行当前配置"}
          </button>
          <p className="hint">
            拖动 O/T 滑块或点击防御开关即自动提交；也可点击上方按钮重跑当前配置。
          </p>
        </aside>

        <section className="panel graph-panel" aria-label="节点关系图">
          <h2>{ready.title}</h2>
          <ScenarioGraph
            scenario={ready}
            view={playbackView}
            animationsEnabled={animationsEnabled}
            runEpoch={runEpoch}
          />
          <p className="hint">
            N1→N2 是路径 A/B 的共享物理连线（逻辑步骤 A1 与 B1）。
          </p>
          <PlaybackBar
            eventsCount={eventsCount}
            eventIndex={eventIndex}
            playing={playing}
            animationsEnabled={animationsEnabled}
            onAnimationsToggle={toggleAnimations}
            onJump={handleJump}
            onNext={handleNext}
            onPrev={handlePrev}
            onPlayPause={handlePlayPause}
          />
        </section>

        <aside className="panel result-panel" aria-label="运行结果">
          <h2>运行结果</h2>
          {runState.status === "idle" ? (
            <p className="notice">尚未运行。调整 O/T 或防御后自动提交，或点击“运行当前配置”。</p>
          ) : null}
          {runState.status === "running" ? (
            <p className="notice">正在运行…</p>
          ) : null}
          {runState.status === "error" ? (
            <div className="notice error" role="alert">
              <p>运行失败：{runState.message}</p>
              <button type="button" onClick={handleManualRun}>
                重试
              </button>
            </div>
          ) : null}
          {runState.status === "done" ? (
            <>
              <CurrentEventPanel
                result={runState.result}
                eventIndex={eventIndex}
                nodeLabel={nodeLabel}
              />
              <RunResultPanel
                scenario={ready}
                result={runState.result}
                input={runState.input}
              />
              <div className="save-run">
                {saveState.status === "saved" &&
                saveState.runVersion === runVersionRef.current ? (
                  <div className="notice" role="status">
                    <p>
                      已保存运行 #{saveState.record.id}（保存时间{" "}
                      {saveState.record.savedAt}）
                    </p>
                    <p>
                      一句话解释（
                      {explanationSourceLabel(saveState.record.explanationSource)}
                      ）：{saveState.record.explanation}
                    </p>
                  </div>
                ) : null}
                {saveState.status === "error" &&
                saveState.runVersion === runVersionRef.current ? (
                  <p className="notice error" role="alert">
                    保存失败：{saveState.message}
                  </p>
                ) : null}
                <button
                  type="button"
                  className="run-button"
                  disabled={saveState.status === "saving"}
                  onClick={() => void handleSaveRun()}
                >
                  {saveState.status === "saving"
                    ? "正在保存…"
                    : "保存此配置的推演"}
                </button>
              </div>
              <div className="learning-quiz" aria-label="三题自测">
                <h3>三题自测</h3>
                <p className="hint">
                  每题都用它自己的固定配置独立推演，与上方工作台当前配置无关，也不评价眼前这次运行。
                </p>
                {questionsState.status === "loading" ? (
                  <p className="notice">正在加载题目…</p>
                ) : null}
                {questionsState.status === "error" ? (
                  <div className="notice error" role="alert">
                    <p>题目加载失败：{questionsState.message}</p>
                    <button
                      type="button"
                      onClick={() => void fetchLearningQuestions()}
                    >
                      重试
                    </button>
                  </div>
                ) : null}
                {questionsState.status === "done" ? (
                  <>
                    {questionsState.questions.map((question) => (
                      <div className="quiz-question" key={question.id}>
                        <p className="quiz-prompt">
                          <strong>{question.id}</strong> · {question.prompt}
                        </p>
                        <p className="quiz-config">
                          本题固定配置：{questionConfigText(question)}
                        </p>
                        <div
                          className="quiz-options"
                          role="radiogroup"
                          aria-label={`${question.id} 选项`}
                        >
                          {question.options.map((option) => {
                            const selected =
                              quizPredictions[question.id] === option.id;
                            return (
                              <button
                                key={option.id}
                                type="button"
                                className={`quiz-option ${selected ? "active" : ""}`}
                                aria-pressed={selected}
                                disabled={quizState.status === "saving"}
                                onClick={() =>
                                  handlePredict(question.id, option.id)
                                }
                              >
                                {option.id}. {option.text}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    <div className="quiz-actions">
                      <button
                        type="button"
                        className="run-button"
                        disabled={
                          quizState.status === "saving" ||
                          saveState.status !== "saved" ||
                          saveState.runVersion !== runVersionRef.current ||
                          questionsState.questions.some(
                            (question) =>
                              quizPredictions[question.id] === undefined
                          )
                        }
                        onClick={() => void handleSubmitLearning()}
                      >
                        {quizState.status === "saving"
                          ? "正在提交…"
                          : "提交三题预测并保存学习记录"}
                      </button>
                      {saveState.status !== "saved" ||
                      saveState.runVersion !== runVersionRef.current ? (
                        <p className="hint">
                          先保存本次运行，才能把三题预测与这条运行关联。
                        </p>
                      ) : null}
                    </div>
                    {quizState.status === "error" &&
                    quizState.runVersion === runVersionRef.current ? (
                      <p className="notice error" role="alert">
                        提交失败：{quizState.message}
                      </p>
                    ) : null}
                    {quizState.status === "done" &&
                    quizState.runVersion === runVersionRef.current ? (
                      <>
                        <p className="notice" role="status">
                          学习记录已保存 #{quizState.record.id}
                          （同一运行重复提交会覆盖，不保留历史答案）
                        </p>
                        {renderFeedbackList(
                          quizState.record.questions,
                          quizState.record.feedbacks
                        )}
                      </>
                    ) : null}
                  </>
                ) : null}
              </div>
              {baselineSnapshot &&
              baselineMatches &&
              runState.input.conditions.O === conditions.O &&
              runState.input.conditions.T === conditions.T ? (
                runState.input.defenses.length === 0 ? (
                  <p className="baseline-self notice">
                    当前运行即为无防御基线，选择防御后自动出现对比。
                  </p>
                ) : (
                  <BaselineComparisonPanel
                    scenario={ready}
                    baseline={baselineSnapshot}
                    currentInput={runState.input}
                    currentResult={runState.result}
                  />
                )
              ) : null}
            </>
          ) : null}
        </aside>
      </section>
    );
  }

  return (
    <main className="shell">
      <header className="topbar">
        <p className="stage">Day 12 · 显式保存与规则解释</p>
        <nav className="topnav" aria-label="页面">
          {pages.map((item) => (
            <button
              key={item.id}
              type="button"
              className={page === item.id ? "nav-tab active" : "nav-tab"}
              aria-current={page === item.id ? "page" : undefined}
              onClick={() => setPage(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>
      {content}
    </main>
  );
}
