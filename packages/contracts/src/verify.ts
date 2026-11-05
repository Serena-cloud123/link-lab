/* ---------- 显式版本核对 ---------- */

/**
 * match：记录与当前场景同版本，且重算结果与快照深度相等。
 * result-mismatch：同版本，但重算结果与快照不一致（快照本身不改）。
 * version-mismatch：记录场景/版本与当前不一致，直接判定，不重算。
 */
export type VerifyStatus = "match" | "result-mismatch" | "version-mismatch";

export interface VerifyRunResponse {
  status: VerifyStatus;
  recordScenarioId: string;
  recordScenarioVersion: number;
  currentScenarioId: string;
  currentScenarioVersion: number;
  /** 仅在 result-mismatch 时给出差异摘要；核对本身不写库。 */
  differences?: string[];
}
