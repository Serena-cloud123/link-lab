import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunInput, RunRecord } from "@link-lab/contracts";
import { evaluateRun } from "@link-lab/engine";
import { buildServer } from "../src/app";

// spy: true 让引擎导出变成透传 spy：核对用例可以断言调用次数，行为仍是真实推演
vi.mock("@link-lab/engine", { spy: true });

const baseInput: RunInput = {
  scenarioId: "campus-registration",
  conditions: { O: "open", T: "granted" },
  defenses: ["D1"]
};

function postRun(app: FastifyInstance, input: RunInput) {
  return app.inject({ method: "POST", url: "/api/runs", payload: input });
}

function getRun(app: FastifyInstance, id: string) {
  return app.inject({ method: "GET", url: `/api/runs/${id}` });
}

function postVerify(app: FastifyInstance, id: string) {
  return app.inject({ method: "POST", url: `/api/runs/${id}/verify` });
}

interface RawRunRow {
  input_json: string;
  result_json: string;
  explanation: string;
}

/** 直接读测试库，绕开接口，验证字段原文未被改写。 */
function readRawRun(dbPath: string, id: string): RawRunRow | undefined {
  const db = new DatabaseSync(dbPath);
  try {
    const row = db
      .prepare(
        "SELECT input_json, result_json, explanation FROM runs WHERE id = ?"
      )
      .get(id) as RawRunRow | undefined;
    return row;
  } finally {
    db.close();
  }
}

interface RawLearningRow {
  id: string;
  questions_json: string;
  predictions_json: string;
  feedbacks_json: string;
  resumed_event_index: number | bigint | null;
}

function readRawLearning(dbPath: string, runId: string): RawLearningRow | undefined {
  const db = new DatabaseSync(dbPath);
  try {
    const row = db
      .prepare(
        "SELECT id, questions_json, predictions_json, feedbacks_json, resumed_event_index FROM learning_records WHERE run_id = ?"
      )
      .get(runId) as RawLearningRow | undefined;
    return row;
  } finally {
    db.close();
  }
}

function countLearning(dbPath: string): number {
  const db = new DatabaseSync(dbPath);
  try {
    const row = db
      .prepare("SELECT COUNT(*) AS count FROM learning_records")
      .get() as { count: number | bigint };
    return Number(row.count);
  } finally {
    db.close();
  }
}

/** 测试专用：按真实记录复制一条并改写场景版本/ID/结果，模拟历史快照。 */
function insertFabricatedRun(dbPath: string, record: RunRecord): void {
  const db = new DatabaseSync(dbPath);
  try {
    db.prepare(
      `INSERT INTO runs (
        id, saved_at, scenario_id, scenario_version,
        input_json, result_json, explanation,
        explanation_source, explanation_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
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
  } finally {
    db.close();
  }
}

describe("Day 13 — POST /api/runs/:id/verify 显式版本核对", () => {
  let dir: string;
  let dbPath: string;
  let app: FastifyInstance;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "link-lab-verify-"));
    dbPath = join(dir, "link-lab.db");
    app = buildServer({ logger: false }, { dbPath });
  });

  afterAll(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("同版本记录核对返回 match，且 GET 原文前后完全一致", async () => {
    const created = (await postRun(app, baseInput)).json() as RunRecord;

    const before = await getRun(app, created.id);
    expect(before.statusCode).toBe(200);

    const verifyResponse = await postVerify(app, created.id);
    expect(verifyResponse.statusCode).toBe(200);
    expect(verifyResponse.json()).toEqual({
      status: "match",
      recordScenarioId: "campus-registration",
      recordScenarioVersion: 1,
      currentScenarioId: "campus-registration",
      currentScenarioVersion: 1
    });

    const after = await getRun(app, created.id);
    expect(after.statusCode).toBe(200);
    // 原文级比较：核对不改变已保存快照
    expect(after.body).toBe(before.body);

    // 同版本路径确实调用了引擎一次
    expect(evaluateRun).toHaveBeenCalledTimes(2); // 1 次 POST /api/runs + 1 次核对
  });

  it("核对不改 input_json / result_json / explanation 原文，也不写 learning_records", async () => {
    const created = (await postRun(app, baseInput)).json() as RunRecord;

    // 先写一条学习记录，核对后必须原样保留
    const learningResponse = await app.inject({
      method: "POST",
      url: "/api/learning",
      payload: {
        runId: created.id,
        predictions: { Q1: "0", Q2: "2", Q3: "0" },
        resumedEventIndex: 2
      }
    });
    expect(learningResponse.statusCode).toBe(200);

    const runBefore = readRawRun(dbPath, created.id);
    const learningBefore = readRawLearning(dbPath, created.id);
    const learningCountBefore = countLearning(dbPath);
    expect(runBefore).toBeDefined();
    expect(learningBefore).toBeDefined();
    expect(learningCountBefore).toBeGreaterThan(0);

    const verifyResponse = await postVerify(app, created.id);
    expect(verifyResponse.statusCode).toBe(200);
    expect(verifyResponse.json().status).toBe("match");

    const runAfter = readRawRun(dbPath, created.id);
    const learningAfter = readRawLearning(dbPath, created.id);
    const learningCountAfter = countLearning(dbPath);

    expect(runAfter).toEqual(runBefore);
    expect(runAfter!.input_json).toBe(runBefore!.input_json);
    expect(runAfter!.result_json).toBe(runBefore!.result_json);
    expect(runAfter!.explanation).toBe(runBefore!.explanation);

    expect(learningAfter).toEqual(learningBefore);
    expect(learningCountAfter).toBe(learningCountBefore);
  });

  it("版本不一致直接返回 version-mismatch，不调用 evaluateRun，库中记录不变", async () => {
    const created = (await postRun(app, baseInput)).json() as RunRecord;
    const fabricated: RunRecord = {
      ...created,
      id: "verify-version-999",
      scenarioVersion: 99
    };
    insertFabricatedRun(dbPath, fabricated);

    const before = await getRun(app, fabricated.id);
    expect(before.statusCode).toBe(200);
    const rawBefore = readRawRun(dbPath, fabricated.id);
    const callsBefore = vi.mocked(evaluateRun).mock.calls.length;

    const verifyResponse = await postVerify(app, fabricated.id);
    expect(verifyResponse.statusCode).toBe(200);
    expect(verifyResponse.json()).toEqual({
      status: "version-mismatch",
      recordScenarioId: "campus-registration",
      recordScenarioVersion: 99,
      currentScenarioId: "campus-registration",
      currentScenarioVersion: 1
    });

    // 未重算：引擎调用次数不变
    expect(vi.mocked(evaluateRun).mock.calls.length).toBe(callsBefore);

    const after = await getRun(app, fabricated.id);
    expect(after.body).toBe(before.body);
    expect(readRawRun(dbPath, fabricated.id)).toEqual(rawBefore);
  });

  it("场景 ID 不一致同样返回 version-mismatch，不调用 evaluateRun", async () => {
    const created = (await postRun(app, baseInput)).json() as RunRecord;
    const fabricated: RunRecord = {
      ...created,
      id: "verify-scenario-other",
      scenarioId: "other-scenario"
    };
    insertFabricatedRun(dbPath, fabricated);

    const rawBefore = readRawRun(dbPath, fabricated.id);
    const callsBefore = vi.mocked(evaluateRun).mock.calls.length;

    const verifyResponse = await postVerify(app, fabricated.id);
    expect(verifyResponse.statusCode).toBe(200);
    expect(verifyResponse.json()).toMatchObject({
      status: "version-mismatch",
      recordScenarioId: "other-scenario",
      currentScenarioId: "campus-registration"
    });
    expect(vi.mocked(evaluateRun).mock.calls.length).toBe(callsBefore);
    expect(readRawRun(dbPath, fabricated.id)).toEqual(rawBefore);
  });

  it("同版本但结果不一致返回 result-mismatch（附差异摘要），且不改库中记录", async () => {
    const created = (await postRun(app, baseInput)).json() as RunRecord;
    const fabricated: RunRecord = {
      ...created,
      id: "verify-result-drift",
      result: { ...created.result, alertCount: created.result.alertCount + 7 }
    };
    insertFabricatedRun(dbPath, fabricated);

    const before = await getRun(app, fabricated.id);
    const rawBefore = readRawRun(dbPath, fabricated.id);

    const verifyResponse = await postVerify(app, fabricated.id);
    expect(verifyResponse.statusCode).toBe(200);
    const body = verifyResponse.json() as {
      status: string;
      differences: string[];
    };
    expect(body.status).toBe("result-mismatch");
    expect(Array.isArray(body.differences)).toBe(true);
    expect(body.differences.length).toBeGreaterThan(0);
    expect(body.differences.join("")).toContain("告警数量不一致");

    // 旧快照仍完整可读，且原文未被改动
    const after = await getRun(app, fabricated.id);
    expect(after.body).toBe(before.body);
    expect(readRawRun(dbPath, fabricated.id)).toEqual(rawBefore);

    // 核对本身也不写 learning_records
    expect(readRawLearning(dbPath, fabricated.id)).toBeUndefined();
  });

  it("运行不存在返回 404，message 为「运行记录不存在」", async () => {
    const response = await postVerify(app, "missing-run-id");
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      statusCode: 404,
      message: "运行记录不存在"
    });
  });
});
