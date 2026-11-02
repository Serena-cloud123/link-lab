import type {
  PathResult,
  RunInput,
  RunResult,
  Scenario
} from "@link-lab/contracts";
import { oValueText, tValueText } from "../labels";

export interface BaselineSnapshot {
  scenarioId: string;
  scenarioVersion: number;
  conditions: RunInput["conditions"];
  input: RunInput;
  result: RunResult;
}

type DiffKind =
  | "became-blocked"
  | "stayed-reached"
  | "already-blocked"
  | "became-reached";

const diffText: Record<DiffKind, string> = {
  "became-blocked": "由到达变为阻断",
  "stayed-reached": "保持到达",
  "already-blocked": "原本已阻断",
  "became-reached": "由阻断变为到达"
};

/** 仅比较两份返回值，不重新执行 O/T/D1/D2/D3 的判定规则。 */
function diffOf(
  baseline: PathResult | undefined,
  current: PathResult | undefined
): DiffKind {
  const bReached = baseline?.outcome === "reached";
  const cReached = current?.outcome === "reached";
  if (bReached && !cReached) return "became-blocked";
  if (bReached && cReached) return "stayed-reached";
  if (!bReached && !cReached) return "already-blocked";
  return "became-reached";
}

function outcomeText(pathResult: PathResult | undefined): string {
  if (!pathResult) return "无结果";
  if (pathResult.outcome === "reached") return "已到达模拟数据";
  const detail = [pathResult.firstBlockedStepId, pathResult.blockedReason]
    .filter(Boolean)
    .join("：");
  return detail ? `已阻断（${detail}）` : "已阻断";
}

function alertDiffText(baseline: number, current: number): string {
  const delta = current - baseline;
  if (delta > 0) return `新增告警 ${delta} 条`;
  if (delta < 0) return `告警减少 ${-delta} 条`;
  return "告警数未变";
}

interface Props {
  scenario: Scenario;
  baseline: BaselineSnapshot;
  currentInput: RunInput;
  currentResult: RunResult;
}

export function BaselineComparisonPanel({
  scenario,
  baseline,
  currentInput,
  currentResult
}: Props) {
  const pathIds = scenario.paths.map((path) => path.id);
  const baselinePaths = new Map(
    baseline.result.pathResults.map((item) => [item.pathId, item])
  );
  const currentPaths = new Map(
    currentResult.pathResults.map((item) => [item.pathId, item])
  );

  const rows = pathIds.map((pathId) => {
    const b = baselinePaths.get(pathId);
    const c = currentPaths.get(pathId);
    return { pathId, b, c, kind: diffOf(b, c) };
  });

  const blockedCount = rows.filter((row) => row.kind === "became-blocked").length;
  const residual = rows.filter((row) => row.kind === "stayed-reached");
  const delta = currentResult.alertCount - baseline.result.alertCount;

  const notes: string[] = [];
  if (blockedCount > 0 && residual.length > 0) {
    const ids = residual.map((row) => row.pathId).join("、");
    notes.push(`路径 ${ids} 仍到达，是残余可达路径（本次防御没有阻断它）。`);
  }
  if (blockedCount === 0 && delta === 0) {
    notes.push(
      "本次比较没有新增阻断，也没有新增告警。这只说明这组同条件运行的观察，不代表该防御在其他条件下无效。"
    );
  } else if (blockedCount === 0 && delta < 0) {
    notes.push(`本次比较没有新增阻断；告警减少 ${-delta} 条。`);
  } else if (blockedCount === 0 && delta > 0) {
    notes.push(`新增告警 ${delta} 条；路径未被阻断。`);
  }

  return (
    <section className="comparison-panel" aria-label="同条件对比">
      <p className="comparison-title">同条件对比：无防御基线 → 当前防御运行</p>
      <p className="comparison-meta">
        O {oValueText[baseline.conditions.O]} · T{" "}
        {tValueText[baseline.conditions.T]} · 当前防御{" "}
        {currentInput.defenses.length > 0 ? currentInput.defenses.join("、") : "无"}
      </p>
      <ul className="comparison-list">
        {rows.map((row) => (
          <li key={row.pathId} className="comparison-item">
            <p className="comparison-path">路径 {row.pathId}</p>
            <p className="comparison-line">基线：{outcomeText(row.b)}</p>
            <p className="comparison-line">当前：{outcomeText(row.c)}</p>
            <span className={`diff-tag diff-${row.kind}`}>{diffText[row.kind]}</span>
          </li>
        ))}
      </ul>
      <p className="comparison-alerts">
        基线告警 {baseline.result.alertCount} 条 → 当前告警{" "}
        {currentResult.alertCount} 条（{alertDiffText(baseline.result.alertCount, currentResult.alertCount)}）
      </p>
      {notes.map((note) => (
        <p key={note} className="comparison-note">
          {note}
        </p>
      ))}
      <p className="hint">
        对比只依据这两次真实接口响应；前端不重新判定 O/T/D1/D2/D3 规则。
      </p>
    </section>
  );
}
