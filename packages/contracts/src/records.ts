import type { RunInput, RunResult } from "./index.js";

/* ---------- 运行保存记录 ---------- */

export interface RunSnapshot {
  id: string;
  savedAt: string;
  scenarioId: string;
  scenarioVersion: number;
  input: RunInput;
  result: RunResult;
  explanation: string;
  explanationSource: "template";
  explanationVersion: number;
}

export interface RunRecord extends RunSnapshot {}

export type SaveRunResponse = RunRecord;
