import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  LearningRecord,
  LearningQuestion,
  PathEvent,
  RunInput,
  RunRecord,
  Scenario
} from "@link-lab/contracts";
import { evaluateRun } from "@link-lab/engine";
import { buildServer } from "../src/app";
import {
  HANDWRITTEN_CORRECT_OPTIONS,
  deriveQuestion
} from "../src/learning";

const presetAWithD1: RunInput = {
  scenarioId: "campus-registration",
  presetId: "A",
  conditions: { O: "open", T: "granted" },
  defenses: ["D1"]
};

function postRun(app: FastifyInstance, input: RunInput) {
  return app.inject({ method: "POST", url: "/api/runs", payload: input });
}

function postLearning(app: FastifyInstance, payload: unknown) {
  return app.inject({ method: "POST", url: "/api/learning", payload: payload as object });
}

function getLearning(app: FastifyInstance, runId: string) {
  return app.inject({ method: "GET", url: `/api/runs/${runId}/learning` });
}

describe("Day 13 — 三题与学习记录", () => {
  let dir: string;
  let dbPath: string;
  let app: FastifyInstance;
  let scenario: Scenario;
  let run: RunRecord;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "link-lab-learning-"));
    dbPath = join(dir, "link-lab.db");
    app = buildServer({ logger: false }, { dbPath });

    const scenarioResponse = await app.inject({
      method: "GET",
      url: "/api/scenarios/campus-registration"
    });
    scenario = scenarioResponse.json() as Scenario;

    run = (await postRun(app, presetAWithD1)).json() as RunRecord;
  });

  afterAll(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  /* ---------- 手写答案 vs 引擎推导 ---------- */

  it("手写固定的 correctOption 与引擎推导结果相等（不相等则停下报告）", () => {
    for (const question of [
      { id: "Q1" as const, expected: "0" },
      { id: "Q2" as const, expected: "2" },
      { id: "Q3" as const, expected: "0" }
    ]) {
      const derivation = deriveQuestion(scenario, question.id);
      expect(
        derivation.optionId,
        `题目 ${question.id}：引擎推导 ${derivation.optionId}，手写 ${HANDWRITTEN_CORRECT_OPTIONS[question.id]}`
      ).toBe(HANDWRITTEN_CORRECT_OPTIONS[question.id]);
      expect(derivation.optionId).toBe(question.expected);
    }
  });

  it("GET /api/learning/questions 只下发题干、选项与固定配置，不含 correctOption", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/learning/questions"
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { questions: LearningQuestion[] };
    expect(body.questions.map((q) => q.id)).toEqual(["Q1", "Q2", "Q3"]);

    // 序列化后不得出现 correctOption / isCorrect 字段
    expect(response.body).not.toContain("correctOption");
    expect(response.body).not.toContain("isCorrect");

    expectedConfigs(body.questions);
  });

  function expectedConfigs(questions: LearningQuestion[]) {
    const byId = Object.fromEntries(questions.map((q) => [q.id, q]));
    expect(byId.Q1.config).toEqual({
      presetId: "A",
      conditions: { O: "open", T: "granted" },
      defenses: ["D1"]
    });
    expect(byId.Q2.config).toEqual({
      presetId: "A",
      conditions: { O: "open", T: "granted" },
      defenses: ["D3"]
    });
    expect(byId.Q3.config).toEqual({
      presetId: "B",
      conditions: { O: "closed", T: "granted" },
      defenses: ["D1"]
    });
    expect(byId.Q1.options).toHaveLength(4);
    expect(byId.Q2.options).toHaveLength(3);
    expect(byId.Q3.options).toHaveLength(2);
  }

  it("Q3 条件依据取自 B2 的 O 条件检查 reason，不靠 blockedReason 字符串匹配", () => {
    const derivation = deriveQuestion(scenario, "Q3");
    const q3Config: RunInput = {
      scenarioId: scenario.id,
      presetId: "B",
      conditions: { O: "closed", T: "granted" },
      defenses: ["D1"]
    };
    const event = evaluateRun(scenario, q3Config).events.find(
      (item: PathEvent) => item.pathId === "B" && item.stepId === "B2"
    );
    const oCheck = event?.conditionChecks.find((check) => check.id === "O");
    expect(oCheck).toBeDefined();
    expect(oCheck!.satisfied).toBe(false);
    expect(oCheck!.reason).toBe("诊断页面对普通账号关闭，访问被拒绝");
    expect(derivation.conditionBasis).toBe(oCheck!.reason);
    expect(derivation.evidence.conditionCheck).toEqual(oCheck);
  });

  /* ---------- POST /api/learning ---------- */

  it("关联运行不存在时返回 404「运行记录不存在」", async () => {
    const response = await postLearning(app, {
      runId: "missing-run",
      predictions: { Q1: "0", Q2: "2", Q3: "0" }
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ message: "运行记录不存在" });
  });

  it("拒绝前端提交 answers / feedbacks 等越权字段（400）", async () => {
    const response = await postLearning(app, {
      runId: run.id,
      predictions: { Q1: "0", Q2: "2", Q3: "0" },
      answers: { Q1: "0", Q2: "2", Q3: "0" }
    });
    expect(response.statusCode).toBe(400);
  });

  it("选项 id 不属于该题时返回 400", async () => {
    const response = await postLearning(app, {
      runId: run.id,
      predictions: { Q1: "9", Q2: "2", Q3: "0" }
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ message: "题目 Q1 的选项 9 不存在" });
  });

  it("提交全错答案时后端仍给出正确 feedback，且逐题显式比较 isCorrect", async () => {
    const response = await postLearning(app, {
      runId: run.id,
      predictions: { Q1: "1", Q2: "0", Q3: "1" },
      resumedEventIndex: 5
    });
    expect(response.statusCode).toBe(200);
    const record = response.json() as LearningRecord;

    expect(record.runId).toBe(run.id);
    expect(record.resumedEventIndex).toBe(5);
    expect(record.feedbacks).toHaveLength(3);

    const byId = Object.fromEntries(record.feedbacks.map((f) => [f.questionId, f]));
    expect(byId.Q1.correctOption).toBe("0");
    expect(byId.Q2.correctOption).toBe("2");
    expect(byId.Q3.correctOption).toBe("0");
    for (const feedback of record.feedbacks) {
      expect(feedback.isCorrect).toBe(false);
      expect(feedback.isCorrect).toBe(
        record.predictions[feedback.questionId] === feedback.correctOption
      );
      expect(feedback.predictedOption).toBe(record.predictions[feedback.questionId]);
    }
  });

  it("反馈按各题固定配置推演，不受关联运行配置影响（Q2 告警数取实际推演值）", async () => {
    // 关联运行是 preset A + D1：alertCount = 0
    const runDetail = (await app.inject({
      method: "GET",
      url: `/api/runs/${run.id}`
    })).json() as RunRecord;
    expect(runDetail.result.alertCount).toBe(0);

    const feedbacks = deriveQuestion(scenario, "Q2");
    const response = await postLearning(app, {
      runId: run.id,
      predictions: { Q1: "0", Q2: "2", Q3: "0" }
    });
    const record = response.json() as LearningRecord;
    const q2 = record.feedbacks.find((f) => f.questionId === "Q2")!;

    // Q2 固定配置（preset A + D3）实际推演出 2 条告警，与关联运行的 0 条无关
    expect(q2.evidence.alertCount).toBe(2);
    expect(q2.conditionBasis).toBe(feedbacks.conditionBasis);
    expect(q2.conditionBasis).toContain(String(q2.evidence.alertCount));
    expect(q2.isCorrect).toBe(true);
  });

  it("同一 runId 重复提交为覆盖：id 稳定、只保留最新答案、库中仅一行", async () => {
    const first = (await postLearning(app, {
      runId: run.id,
      predictions: { Q1: "1", Q2: "0", Q3: "1" },
      resumedEventIndex: 3
    })).json() as LearningRecord;

    // 稍后再提交一次，确保 savedAt 有变化
    await new Promise((resolve) => setTimeout(resolve, 20));
    const second = (await postLearning(app, {
      runId: run.id,
      predictions: { Q1: "0", Q2: "2", Q3: "0" },
      resumedEventIndex: 6
    })).json() as LearningRecord;

    expect(second.id).toBe(first.id);
    expect(second.predictions).toEqual({ Q1: "0", Q2: "2", Q3: "0" });
    expect(second.resumedEventIndex).toBe(6);
    expect(second.feedbacks.every((f) => f.isCorrect)).toBe(true);

    const db = new DatabaseSync(dbPath);
    try {
      const row = db
        .prepare("SELECT COUNT(*) AS n FROM learning_records WHERE run_id = ?")
        .get(run.id) as { n: number | bigint };
      expect(Number(row.n)).toBe(1);
    } finally {
      db.close();
    }
  });

  it("resumedEventIndex 可空：不传时为 null，刷新后读回一致", async () => {
    const response = await postLearning(app, {
      runId: run.id,
      predictions: { Q1: "0", Q2: "2", Q3: "0" }
    });
    const record = response.json() as LearningRecord;
    expect(record.resumedEventIndex).toBeNull();

    const fetched = (await getLearning(app, run.id)).json() as LearningRecord;
    expect(fetched).toEqual(record);
  });

  /* ---------- GET /api/runs/:id/learning ---------- */

  it("运行不存在与「暂无学习记录」的 404 message 不同", async () => {
    const missingRun = await getLearning(app, "missing-run");
    expect(missingRun.statusCode).toBe(404);
    expect(missingRun.json()).toMatchObject({ message: "运行记录不存在" });

    const otherRun = (await postRun(app, {
      scenarioId: "campus-registration",
      conditions: { O: "open", T: "granted" },
      defenses: []
    })).json() as RunRecord;

    const noLearning = await getLearning(app, otherRun.id);
    expect(noLearning.statusCode).toBe(404);
    expect(noLearning.json()).toMatchObject({ message: "该运行暂无学习记录" });
  });

  it("POST /api/learning 不修改 runs 表的 input/result/explanation 原文", async () => {
    const before = (await app.inject({
      method: "GET",
      url: `/api/runs/${run.id}`
    })).json() as RunRecord;

    await postLearning(app, {
      runId: run.id,
      predictions: { Q1: "1", Q2: "1", Q3: "1" }
    });

    const after = (await app.inject({
      method: "GET",
      url: `/api/runs/${run.id}`
    })).json() as RunRecord;
    expect(after).toEqual(before);

    // 直接读测试库核对原文不变
    const db = new DatabaseSync(dbPath);
    try {
      const row = db
        .prepare(
          "SELECT input_json, result_json, explanation FROM runs WHERE id = ?"
        )
        .get(run.id) as
        | { input_json: string; result_json: string; explanation: string }
        | undefined;
      expect(row).toBeDefined();
      expect(row!.input_json).toBe(JSON.stringify(before.input));
      expect(row!.result_json).toBe(JSON.stringify(before.result));
      expect(row!.explanation).toBe(before.explanation);
    } finally {
      db.close();
    }
  });
});
