import type { RunInput, RunResult, Scenario } from "@link-lab/contracts";
import { oValueText, stepOutcomeText, tValueText } from "../labels";

interface RunResultPanelProps {
  scenario: Scenario;
  result: RunResult;
  input: RunInput;
}

export function RunResultPanel({ scenario, result, input }: RunResultPanelProps) {
  const nodeLabel = (id: string) =>
    scenario.nodes.find((node) => node.id === id)?.label ?? id;
  // 是否开启 D3 只取决于本次请求发出的防御配置，不由 alertCount 反推
  const d3Enabled = input.defenses.includes("D3");

  return (
    <div className="run-result">
      <p className="run-config">
        本次配置：{input.presetId ? `预设 ${input.presetId}` : "未选预设"} · O{" "}
        {oValueText[input.conditions.O]} · T {tValueText[input.conditions.T]} ·
        防御 {input.defenses.length > 0 ? input.defenses.join("、") : "无"}
      </p>

      <h3>路径结果</h3>
      <ul className="path-results">
        {result.pathResults.map((pathResult) => (
          <li key={pathResult.pathId}>
            <strong>路径 {pathResult.pathId}</strong>：
            {pathResult.outcome === "reached" ? "已到达模拟数据" : "已被阻断"}
            {pathResult.blockedReason ? (
              <span className="reason">（{pathResult.blockedReason}）</span>
            ) : null}
          </li>
        ))}
      </ul>

      <h3>告警</h3>
      <p>共 {result.alertCount} 条。</p>
      {d3Enabled ? (
        <p className="note">D3 只产生告警，不自动阻断。</p>
      ) : (
        <p className="note">本次未开启 D3，因此没有告警。</p>
      )}

      <h3>事件（{result.events.length} 条）</h3>
      <ol className="event-list">
        {result.events.map((event) => (
          <li
            key={event.eventIndex}
            className={`event-item outcome-${event.outcome}`}
          >
            <p>
              #{event.eventIndex} · 路径 {event.pathId} · {event.stepId}：
              {nodeLabel(event.fromNodeId)} → {nodeLabel(event.toNodeId)} —{" "}
              <strong>{stepOutcomeText[event.outcome]}</strong>
            </p>
            {event.conditionChecks.map((check) => (
              <p key={check.id} className="reason">
                {check.reason}
              </p>
            ))}
            {event.alert ? (
              <p className="alert">
                告警（{event.alert.defenseId}）：{event.alert.reason}
              </p>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
