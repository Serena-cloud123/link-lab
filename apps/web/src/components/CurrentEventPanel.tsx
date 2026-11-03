import type { NodeId, PathEvent, RunResult } from "@link-lab/contracts";
import { buildResidualReport, derivePlaybackView } from "../playback";
import { stepOutcomeText } from "../labels";

interface CurrentEventPanelProps {
  result: RunResult;
  eventIndex: number;
  /** 用于把 nodeId 转成中文标签。 */
  nodeLabel: (id: string) => string;
}

function checkActualValueText(value: string | boolean): string {
  if (typeof value === "boolean") return value ? "开启" : "未开启";
  return String(value);
}

export function CurrentEventPanel({
  result,
  eventIndex,
  nodeLabel
}: CurrentEventPanelProps) {
  const view = derivePlaybackView(result, eventIndex);
  const residual = buildResidualReport(result);

  if (!view.event) {
    return (
      <div className="current-event">
        <h3>当前事件</h3>
        <p className="notice">暂无运行结果。</p>
      </div>
    );
  }

  const event: PathEvent = view.event;

  return (
    <div className="current-event" aria-live="polite">
      <h3>当前事件</h3>
      <p className="event-head">
        <strong>
          #{event.eventIndex} · 路径 {event.pathId} · {event.stepId}
        </strong>
        <span className={`event-outcome outcome-${event.outcome}`}>
          {stepOutcomeText[event.outcome]}
        </span>
      </p>
      <p className="event-route">
        流向：{nodeLabel(event.fromNodeId)} → {nodeLabel(event.toNodeId)}
      </p>

      {event.outcome === "skipped" && view.priorRejected ? (
        <p className="event-skipped">
          未执行；被此前事件 #{view.priorRejected.eventIndex} ·{" "}
          {view.priorRejected.stepId}（路径 {view.priorRejected.pathId}）阻断。
        </p>
      ) : null}

      {event.outcome === "rejected" && view.unmetReasons.length > 0 ? (
        <div className="event-rejected">
          <p>被拒位置：{nodeLabel(event.fromNodeId)} → {nodeLabel(event.toNodeId)} 检查点。</p>
          <ul className="unmet-reasons">
            {view.unmetReasons.map((reason, i) => (
              <li key={i}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {event.outcome === "data-arrived" ? (
        <p className="event-arrived">报名明细已到达（模拟）</p>
      ) : null}

      {event.alert ? (
        <div className="event-alert">
          <p>检测到敏感请求，未自动阻断。</p>
          <p className="event-alert-reason">
            敏感接口：{nodeLabel(event.alert.interfaceNodeId as NodeId)} ·{" "}
            {event.alert.reason}
          </p>
        </div>
      ) : null}

      {event.conditionChecks.length > 0 ? (
        <>
          <h4>条件检查</h4>
          <ul className="condition-checks">
            {event.conditionChecks.map((check) => (
              <li
                key={`${event.eventIndex}-${check.id}`}
                className={check.satisfied ? "satisfied" : "unsatisfied"}
              >
                <span className="check-id">{check.id}</span>
                <span className="check-actual">
                  实际值：{checkActualValueText(check.actualValue)}
                </span>
                <span className="check-sat">
                  {check.satisfied ? "已满足" : "未满足"}
                </span>
                <span className="check-reason">{check.reason}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <h3>残余路径说明</h3>
      {residual.allBlocked ? (
        <p className="residual-all-blocked">
          两条已建模路径均未到达模拟数据。
        </p>
      ) : (
        <ul className="residual-list">
          {residual.lines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
