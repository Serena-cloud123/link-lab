import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type {
  PresetId,
  RunInput,
  RunResult,
  Scenario
} from "@link-lab/contracts";
import { fetchScenario, postEvaluation } from "./api";
import { ScenarioGraph } from "./components/ScenarioGraph";
import { RunResultPanel } from "./components/RunResultPanel";
import { oValueText, tValueText } from "./labels";

type PageId = "intro" | "workbench" | "records";

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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function App() {
  const [page, setPage] = useState<PageId>("intro");
  const [scenarioState, setScenarioState] = useState<ScenarioState>({
    status: "loading"
  });
  const [presetId, setPresetId] = useState<PresetId>("A");
  const [runState, setRunState] = useState<RunState>({ status: "idle" });
  const mountedRef = useRef(true);

  const loadScenario = useCallback(async () => {
    setScenarioState({ status: "loading" });
    try {
      const scenario = await fetchScenario();
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

  async function handleRun() {
    if (!scenario || running) return;
    const preset = scenario.presets.find((item) => item.id === presetId);
    if (!preset) return;
    const input: RunInput = {
      scenarioId: scenario.id,
      presetId,
      conditions: preset.conditions,
      defenses: []
    };
    setRunState({ status: "running" });
    try {
      const result = await postEvaluation(input);
      setRunState({ status: "done", result, input });
    } catch (error) {
      setRunState({ status: "error", message: errorMessage(error) });
    }
  }

  function handleSelectPreset(id: PresetId) {
    if (running) return;
    setPresetId(id);
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
          {preset ? (
            <dl className="condition-view">
              <div>
                <dt>{ready.initialConditions.O.label}</dt>
                <dd>{oValueText[preset.conditions.O]}</dd>
              </div>
              <div>
                <dt>{ready.initialConditions.T.label}</dt>
                <dd>{tValueText[preset.conditions.T]}</dd>
              </div>
              <div>
                <dt>防御</dt>
                <dd>无（基线运行）</dd>
              </div>
            </dl>
          ) : null}
          <button
            type="button"
            className="run-button"
            disabled={running || !preset}
            onClick={() => void handleRun()}
          >
            {running ? "正在运行…" : "运行无防御基线"}
          </button>
          <p className="hint">
            O/T 滑块与 D1/D2/D3 选择后续开放，当前只能运行无防御基线。
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
            <p className="notice">
              尚未运行。选择预设后点击“运行无防御基线”。
            </p>
          ) : null}
          {runState.status === "running" ? (
            <p className="notice">正在运行…</p>
          ) : null}
          {runState.status === "error" ? (
            <div className="notice error" role="alert">
              <p>运行失败：{runState.message}</p>
              <button type="button" onClick={() => void handleRun()}>
                重试
              </button>
            </div>
          ) : null}
          {runState.status === "done" ? (
            <RunResultPanel
              scenario={ready}
              result={runState.result}
              input={runState.input}
            />
          ) : null}
        </aside>
      </section>
    );
  }

  return (
    <main className="shell">
      <header className="topbar">
        <p className="stage">Day 8 · 静态工作台与基线运行</p>
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
