import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import type {
  LearningFeedback,
  LearningQuestion,
  LearningQuestionId,
  LearningRecord,
  RunInput,
  RunRecord,
  RunResult,
  RunSummary
} from "@link-lab/contracts";

const RUNS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    saved_at TEXT NOT NULL,
    scenario_id TEXT NOT NULL,
    scenario_version INTEGER NOT NULL,
    input_json TEXT NOT NULL,
    result_json TEXT NOT NULL,
    explanation TEXT NOT NULL,
    explanation_source TEXT NOT NULL,
    explanation_version INTEGER NOT NULL
  )
`;

/**
 * 学习记录独立建表，run_id 建 UNIQUE：同一运行重复提交为覆盖，
 * 不保留历史答案。
 */
const LEARNING_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS learning_records (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL UNIQUE,
    saved_at TEXT NOT NULL,
    questions_json TEXT NOT NULL,
    predictions_json TEXT NOT NULL,
    feedbacks_json TEXT NOT NULL,
    resumed_event_index INTEGER
  )
`;

const INSERT_RUN_SQL = `
  INSERT INTO runs (
    id,
    saved_at,
    scenario_id,
    scenario_version,
    input_json,
    result_json,
    explanation,
    explanation_source,
    explanation_version
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const SELECT_RUN_SQL = `
  SELECT
    id,
    saved_at,
    scenario_id,
    scenario_version,
    input_json,
    result_json,
    explanation,
    explanation_source,
    explanation_version
  FROM runs
  WHERE id = ?
`;

const LIST_RUNS_SQL = `
  SELECT
    id,
    saved_at,
    scenario_id,
    scenario_version,
    input_json,
    result_json
  FROM runs
  ORDER BY saved_at DESC, rowid DESC
`;

/** 单条语句覆盖写入，不先查再写。 */
const UPSERT_LEARNING_SQL = `
  INSERT INTO learning_records (
    id,
    run_id,
    saved_at,
    questions_json,
    predictions_json,
    feedbacks_json,
    resumed_event_index
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(run_id) DO UPDATE SET
    saved_at = excluded.saved_at,
    questions_json = excluded.questions_json,
    predictions_json = excluded.predictions_json,
    feedbacks_json = excluded.feedbacks_json,
    resumed_event_index = excluded.resumed_event_index
`;

const SELECT_LEARNING_BY_RUN_SQL = `
  SELECT
    id,
    run_id,
    saved_at,
    questions_json,
    predictions_json,
    feedbacks_json,
    resumed_event_index
  FROM learning_records
  WHERE run_id = ?
`;

/**
 * 默认库位置由 import.meta.url 推导：
 * apps/api/src/db.ts 与 apps/api/dist/db.js 向上三级都是仓库根，
 * ../data/link-lab.db 因此都指向 apps/api/data/link-lab.db。
 */
export function resolveDatabasePath(
  moduleUrl: string | URL = import.meta.url,
  databasePath: string | undefined = process.env.DATABASE_PATH
): string {
  const fileUrl = typeof moduleUrl === "string" ? new URL(moduleUrl) : moduleUrl;
  const repoRoot = fileURLToPath(new URL("../../../", fileUrl));
  const configured = databasePath?.trim();

  if (configured) {
    return isAbsolute(configured) ? configured : resolve(repoRoot, configured);
  }

  return fileURLToPath(new URL("../data/link-lab.db", fileUrl));
}

export function openRunDatabase(dbPath: string): DatabaseSync {
  if (dbPath !== ":memory:") {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  db.exec(RUNS_TABLE_SQL);
  db.exec(LEARNING_TABLE_SQL);
  return db;
}

export interface RunStore {
  insert(record: RunRecord): void;
  findById(id: string): RunRecord | undefined;
  listRuns(): RunSummary[];
}

interface RunRow {
  id: string;
  saved_at: string;
  scenario_id: string;
  scenario_version: number | bigint;
  input_json: string;
  result_json: string;
  explanation: string;
  explanation_source: string;
  explanation_version: number | bigint;
}

function parseRunRow(row: RunRow): RunRecord {
  return {
    id: row.id,
    savedAt: row.saved_at,
    scenarioId: row.scenario_id,
    scenarioVersion: Number(row.scenario_version),
    input: JSON.parse(row.input_json) as RunInput,
    result: JSON.parse(row.result_json) as RunResult,
    explanation: row.explanation,
    explanationSource: row.explanation_source as "template",
    explanationVersion: Number(row.explanation_version)
  };
}

interface RunSummaryRow {
  id: string;
  saved_at: string;
  scenario_id: string;
  scenario_version: number | bigint;
  input_json: string;
  result_json: string;
}

function parseSummaryRow(row: RunSummaryRow): RunSummary {
  const input = JSON.parse(row.input_json) as RunInput;
  const result = JSON.parse(row.result_json) as RunResult;
  return {
    id: row.id,
    savedAt: row.saved_at,
    scenarioId: row.scenario_id,
    scenarioVersion: Number(row.scenario_version),
    conditions: input.conditions,
    presetId: input.presetId,
    defenses: input.defenses,
    pathResults: result.pathResults,
    alertCount: result.alertCount
  };
}

export function createRunStore(db: DatabaseSync): RunStore {
  const insertStatement = db.prepare(INSERT_RUN_SQL);
  const selectStatement = db.prepare(SELECT_RUN_SQL);
  const listStatement = db.prepare(LIST_RUNS_SQL);

  return {
    insert(record: RunRecord): void {
      insertStatement.run(
        record.id,
        record.savedAt,
        record.scenarioId,
        record.scenarioVersion,
        JSON.stringify(record.input),
        JSON.stringify(record.result),
        record.explanation,
        record.explanationSource,
        record.explanationVersion
      );
    },
    findById(id: string): RunRecord | undefined {
      const row = selectStatement.get(id) as RunRow | undefined;
      return row ? parseRunRow(row) : undefined;
    },
    listRuns(): RunSummary[] {
      const rows = listStatement.all() as unknown as RunSummaryRow[];
      return rows.map(parseSummaryRow);
    }
  };
}

/* ---------- 学习记录存储 ---------- */

export interface LearningStore {
  /** 单条语句覆盖写入；返回库中实际存储的行（id 首次写入后保持稳定）。 */
  upsert(record: LearningRecord): LearningRecord;
  findByRunId(runId: string): LearningRecord | undefined;
}

interface LearningRow {
  id: string;
  run_id: string;
  saved_at: string;
  questions_json: string;
  predictions_json: string;
  feedbacks_json: string;
  resumed_event_index: number | bigint | null;
}

function parseLearningRow(row: LearningRow): LearningRecord {
  return {
    id: row.id,
    runId: row.run_id,
    savedAt: row.saved_at,
    questions: JSON.parse(row.questions_json) as LearningQuestion[],
    predictions: JSON.parse(row.predictions_json) as Record<
      LearningQuestionId,
      string
    >,
    feedbacks: JSON.parse(row.feedbacks_json) as LearningFeedback[],
    resumedEventIndex:
      row.resumed_event_index === null ? null : Number(row.resumed_event_index)
  };
}

export function createLearningStore(db: DatabaseSync): LearningStore {
  const upsertStatement = db.prepare(UPSERT_LEARNING_SQL);
  const selectStatement = db.prepare(SELECT_LEARNING_BY_RUN_SQL);

  return {
    upsert(record: LearningRecord): LearningRecord {
      upsertStatement.run(
        record.id,
        record.runId,
        record.savedAt,
        JSON.stringify(record.questions),
        JSON.stringify(record.predictions),
        JSON.stringify(record.feedbacks),
        record.resumedEventIndex
      );
      // 写后读回，保证覆盖写入时返回的是库中真实行（id 稳定）
      const row = selectStatement.get(record.runId) as LearningRow | undefined;
      if (!row) {
        throw new Error(`学习记录写入后读取失败：runId=${record.runId}`);
      }
      return parseLearningRow(row);
    },
    findByRunId(runId: string): LearningRecord | undefined {
      const row = selectStatement.get(runId) as LearningRow | undefined;
      return row ? parseLearningRow(row) : undefined;
    }
  };
}
