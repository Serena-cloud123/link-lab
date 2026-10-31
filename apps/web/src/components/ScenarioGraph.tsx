import { useMemo } from "react";
import {
  ReactFlow,
  MarkerType,
  type Edge,
  type Node
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Scenario } from "@link-lab/contracts";

const NODE_WIDTH = 180;

interface GraphEdge extends Edge {
  stepIds: string[];
}

interface ScenarioGraphProps {
  scenario: Scenario;
}

export function ScenarioGraph({ scenario }: ScenarioGraphProps) {
  const nodes = useMemo<Node[]>(
    () =>
      scenario.nodes.map((node) => ({
        id: node.id,
        // 场景 JSON 的 canvasX/canvasY 按节点中心给出，React Flow 需要左上角坐标
        position: { x: node.canvasX - NODE_WIDTH / 2, y: node.canvasY },
        data: {
          label: (
            <span className="graph-node-label">
              <strong>{node.label}</strong>
              <small>{node.description}</small>
            </span>
          )
        },
        style: { width: NODE_WIDTH },
        draggable: false
      })),
    [scenario]
  );

  const edges = useMemo<Edge[]>(() => {
    // N1→N2 是 A1 与 B1 共享的物理连线：按 from->to 去重，
    // 但每条边保留逻辑步骤映射（stepIds），事件列表仍单独渲染 8 步。
    const map = new Map<string, GraphEdge>();
    for (const path of scenario.paths) {
      for (const step of path.steps) {
        const id = `${step.from}->${step.to}`;
        const existing = map.get(id);
        if (existing) {
          existing.stepIds.push(step.id);
          existing.label = existing.stepIds.join(" / ");
        } else {
          map.set(id, {
            id,
            source: step.from,
            target: step.to,
            label: step.id,
            stepIds: [step.id],
            markerEnd: { type: MarkerType.ArrowClosed }
          });
        }
      }
    }
    return [...map.values()];
  }, [scenario]);

  return (
    <div className="graph-container">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        colorMode="dark"
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        elementsSelectable={false}
        zoomOnDoubleClick={false}
        minZoom={0.2}
      />
    </div>
  );
}
