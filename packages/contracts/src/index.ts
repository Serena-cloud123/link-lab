export type HealthStatus = "ok";

export interface HealthResponse {
  status: HealthStatus;
  service: string;
}

/* ---------- 场景静态结构 ---------- */

export type NodeId = "N1" | "N2" | "N3" | "N4" | "N5" | "N6" | "N7";
export type PathId = "A" | "B";
export type StepId = "A1" | "A2" | "A3" | "B1" | "B2" | "B3" | "B4" | "B5";
export type ConditionId = "O" | "T";
export type DefenseId = "D1" | "D2" | "D3";
export type PresetId = "A" | "B" | "C";

export type OValue = "open" | "closed";
export type TValue = "granted" | "revoked";

export interface Node {
  id: NodeId;
  label: string;
  description: string;
  canvasX: number;
  canvasY: number;
}

export interface PathStep {
  id: StepId;
  from: NodeId;
  to: NodeId;
  condition?: ConditionId;
  barrier?: DefenseId;
  sensitiveArrival?: NodeId;
}

export interface Path {
  id: PathId;
  label: string;
  steps: PathStep[];
}

export interface InitialConditionConfig {
  label: string;
  options: string[];
}

export interface DefenseConfig {
  label: string;
  blocksPath?: PathId;
  alerts?: boolean;
}

export interface Preset {
  id: PresetId;
  label: string;
  conditions: {
    O: OValue;
    T: TValue;
  };
}

export interface Scenario {
  id: string;
  version: number;
  title: string;
  boundary: string;
  nodes: Node[];
  paths: Path[];
  initialConditions: Record<ConditionId, InitialConditionConfig>;
  defenses: Record<DefenseId, DefenseConfig>;
  presets: Preset[];
}

/* ---------- 运行输入 ---------- */

export interface RunInput {
  scenarioId: string;
  presetId?: PresetId;
  conditions: {
    O: OValue;
    T: TValue;
  };
  defenses: DefenseId[];
}

/* ---------- 条件检查 ---------- */

export type CheckableId = ConditionId | DefenseId;

export interface ConditionCheck {
  id: CheckableId;
  actualValue: string | boolean;
  satisfied: boolean;
  reason: string;
}

/* ---------- 事件与告警 ---------- */

export type StepOutcome = "passed" | "rejected" | "skipped" | "data-arrived";

export interface Alert {
  defenseId: "D3";
  interfaceNodeId: NodeId;
  reason: string;
}

export interface PathEvent {
  eventIndex: number;
  pathId: PathId;
  stepId: StepId;
  fromNodeId: NodeId;
  toNodeId: NodeId;
  outcome: StepOutcome;
  conditionChecks: ConditionCheck[];
  alert?: Alert;
}

/* ---------- 路径与运行结果 ---------- */

export type PathFinalOutcome = "reached" | "blocked";

export interface PathResult {
  pathId: PathId;
  outcome: PathFinalOutcome;
  firstBlockedStepId?: StepId;
  blockedReason?: string;
}

export interface RunResult {
  events: PathEvent[];
  pathResults: PathResult[];
  alertCount: number;
}
export type { RunRecord, RunSnapshot, SaveRunResponse } from "./records.js";
