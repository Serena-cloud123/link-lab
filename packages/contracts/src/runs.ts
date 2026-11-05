import type {
  ConditionId,
  DefenseId,
  OValue,
  PathResult,
  PresetId,
  RunInput,
  TValue
} from "./index.js";

/* ---------- 历史列表摘要 ---------- */

/** 历史列表只返回摘要：不含 events、不含 explanation，也不调用引擎。 */
export interface RunSummary {
  id: string;
  savedAt: string;
  scenarioId: string;
  scenarioVersion: number;
  conditions: {
    O: OValue;
    T: TValue;
  };
  presetId?: PresetId;
  defenses: DefenseId[];
  pathResults: PathResult[];
  alertCount: number;
}

export interface ListRunsResponse {
  runs: RunSummary[];
}
