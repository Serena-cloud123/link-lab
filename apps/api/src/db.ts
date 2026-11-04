import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import type { RunInput, RunRecord, RunResult } from "@link-lab/contracts";

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
  return db;
}

export interface RunStore {
  insert(record: RunRecord): void;
  findById(id: string): RunRecord | undefined;
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

export function createRunStore(db: DatabaseSync): RunStore {
  const insertStatement = db.prepare(INSERT_RUN_SQL);
  const selectStatement = db.prepare(SELECT_RUN_SQL);

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
    }
  };
}
