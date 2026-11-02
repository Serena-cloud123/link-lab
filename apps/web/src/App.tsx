import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type {
  DefenseId,
  OValue,
  PresetId,
  RunInput,
  RunResult,
  Scenario,
  TValue
} from "@link-lab/contracts";
import { fetchScenario, postEvaluation } from "./api";
import { ScenarioGraph } from "./components/ScenarioGraph";
import { RunResultPanel } from "./components/RunResultPanel";
import {
  BaselineComparisonPanel,
  type BaselineSnapshot
} from "./components/BaselineComparisonPanel";
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
  // 基线独立轨道：版本号 + 在途标记，与当前运行互不相干
  const baselineVersionRef = useRef(0);
  const baselineInFlightRef = useRef(false);

  const loadScenario = useCallback(async () => {
    setScenarioState({ status: "loading" });
    // 场景重载时旧基线一律失效
    baselineVersionRef.current++;
    baselineInFlightRef.current = false;
    setBaselineState({ status: "idle" });
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

  /**
   * 唯一的当前运行 POST 入口。始终用参数 nextConditions / nextDefenses 显式构造
   * input，不依赖可能滞后的 state。O/T 变化时同步使旧基线失效。
   */
  async function run(nextConditions: Conditions, nextDefenses: DefenseId[]) {
    if (runningRef.current) return;
    const scenario = scenarioRef.current;
    if (!scenario) return;

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

  function handleSelectPreset(id: PresetId) {
    if (runningRef.current) return;
    const scenario = scenarioRef.current;
    if (!scenario) return;
    const preset = scenario.presets.find((p) => p.id === id);
    if (!preset) return;

    // 使在途响应失效
    runVersionRef.current++;
    runningRef.current = false;
    // 切预设是另一条基线失效路径
    invalidateBaseline();

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

  let content: ReactNode;
  if (page === "records") {
    content = (
      <section className="panel records" aria-labelledby="records-title">
        <h2 id="records-title">学习记录</h2>
        <p>保存与回放后续开放。当前版本不保存任何运行，本页没有历史记录。</p>
        <p className="hint">
          后续开放后，这里会列出你保存的运行，可逐条回放并核对当时的事件与条件。
        </p>
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
          <ScenarioGraph scenario={ready} />
          <p className="hint">
            N1→N2 是路径 A/B 的共享物理连线（逻辑步骤 A1 与 B1）。
          </p>
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
              <RunResultPanel
                scenario={ready}
                result={runState.result}
                input={runState.input}
              />
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
        <p className="stage">Day 10 · 同条件基线与干预对比</p>
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
