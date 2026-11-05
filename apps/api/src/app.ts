import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import type {
  LearningRecord,
  RunInput,
  RunRecord,
  SaveLearningRequest,
  Scenario
} from "@link-lab/contracts";
import { evaluateRun } from "@link-lab/engine";
import {
  createLearningStore,
  createRunStore,
  openRunDatabase,
  resolveDatabasePath
} from "./db.ts";
import {
  EXPLANATION_SOURCE,
  EXPLANATION_VERSION,
  buildRunExplanation
} from "./explanation.ts";
import {
  LEARNING_QUESTIONS,
  buildLearningFeedback,
  validatePredictions
} from "./learning.ts";

const scenarioUrl = new URL(
  "../../../scenarios/campus-registration/v1.json",
  import.meta.url
);

function loadScenario(): Scenario {
  try {
    return JSON.parse(readFileSync(scenarioUrl, "utf8")) as Scenario;
  } catch (error) {
    throw new Error(
      `无法读取固定场景文件：${fileURLToPath(scenarioUrl)}（${
        error instanceof Error ? error.message : String(error)
      }）`,
      { cause: error }
    );
  }
}

const scenario = loadScenario();

/* 只使用 JSON Schema 在 HTTP 边界校验；不额外写手写校验函数。 */
const runInputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["scenarioId", "conditions", "defenses"],
  properties: {
    scenarioId: { type: "string", const: "campus-registration" },
    presetId: { type: "string", enum: ["A", "B", "C"] },
    conditions: {
      type: "object",
      additionalProperties: false,
      required: ["O", "T"],
      properties: {
        O: { type: "string", enum: ["open", "closed"] },
        T: { type: "string", enum: ["granted", "revoked"] }
      }
    },
    defenses: {
      type: "array",
      uniqueItems: true,
      maxItems: 3,
      items: { type: "string", enum: ["D1", "D2", "D3"] }
    }
  }
};

/**
 * 学习记录提交体：只接收 runId、三题预测与可选恢复下标。
 * additionalProperties: false 会拒绝 answers / feedbacks 等越权字段，
 * 后端不信任客户端给出的正确答案或路径结论。
 */
const learningInputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["runId", "predictions"],
  properties: {
    runId: { type: "string", minLength: 1 },
    predictions: {
      type: "object",
      additionalProperties: false,
      required: ["Q1", "Q2", "Q3"],
      properties: {
        Q1: { type: "string" },
        Q2: { type: "string" },
        Q3: { type: "string" }
      }
    },
    resumedEventIndex: {
      anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }]
    }
  }
};

export interface StorageOptions {
  dbPath?: string;
}

export function buildServer(
  options: FastifyServerOptions = { logger: true },
  storageOptions: StorageOptions = {}
): FastifyInstance {
  const app = Fastify({
    ...options,
    // Fastify 默认 removeAdditional 会静默删除多余字段，这里改为直接返回 400。
    ajv: { customOptions: { removeAdditional: false } }
  });

  const db = openRunDatabase(
    storageOptions.dbPath ?? resolveDatabasePath()
  );
  const runStore = createRunStore(db);
  const learningStore = createLearningStore(db);
  let databaseClosed = false;
  app.addHook("onClose", async () => {
    if (databaseClosed) return;
    databaseClosed = true;
    db.close();
  });

  app.get("/health", async () => ({
    status: "ok",
    service: "@link-lab/api"
  }));

  app.get("/api/scenarios/campus-registration", async () => scenario);

  app.post(
    "/api/evaluations",
    { schema: { body: runInputSchema } },
    async (request) => {
      return evaluateRun(scenario, request.body as RunInput);
    }
  );

  app.post(
    "/api/runs",
    { schema: { body: runInputSchema } },
    async (request, reply) => {
      const input = request.body as RunInput;
      try {
        const result = evaluateRun(scenario, input);
        const record: RunRecord = {
          id: randomUUID(),
          savedAt: new Date().toISOString(),
          scenarioId: scenario.id,
          scenarioVersion: scenario.version,
          input,
          result,
          explanation: buildRunExplanation(result),
          explanationSource: EXPLANATION_SOURCE,
          explanationVersion: EXPLANATION_VERSION
        };
        runStore.insert(record);
        return reply.code(201).send(record);
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "保存运行失败"
        });
      }
    }
  );

  app.get("/api/runs", async (request, reply) => {
    try {
      const summaries = runStore.listRuns();
      return { runs: summaries };
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({
        statusCode: 500,
        error: "Internal Server Error",
        message: "读取运行列表失败"
      });
    }
  });

  app.get("/api/runs/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const record = runStore.findById(id);
      if (!record) {
        return reply.code(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "运行记录不存在"
        });
      }
      return record;
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({
        statusCode: 500,
        error: "Internal Server Error",
        message: "读取运行记录失败"
      });
    }
  });

  /* ---------- 三题与学习记录 ---------- */

  app.get("/api/learning/questions", async () => ({
    // 只下发题干、选项与固定配置；correctOption 只在 POST 响应里出现
    questions: LEARNING_QUESTIONS
  }));

  app.post(
    "/api/learning",
    { schema: { body: learningInputSchema } },
    async (request, reply) => {
      const body = request.body as SaveLearningRequest;
      try {
        if (!runStore.findById(body.runId)) {
          return reply.code(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "运行记录不存在"
          });
        }

        // 只校验选项是否属于该题；对错完全由后端推演决定
        const invalid = validatePredictions(body.predictions);
        if (invalid) {
          return reply.code(400).send({
            statusCode: 400,
            error: "Bad Request",
            message: invalid
          });
        }

        const feedbacks = buildLearningFeedback(scenario, body.predictions);
        const record: LearningRecord = {
          id: randomUUID(),
          runId: body.runId,
          savedAt: new Date().toISOString(),
          questions: LEARNING_QUESTIONS,
          predictions: body.predictions,
          feedbacks,
          resumedEventIndex: body.resumedEventIndex ?? null
        };

        // 同一 runId 覆盖写入（UNIQUE + ON CONFLICT）
        return reply.code(200).send(learningStore.upsert(record));
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "保存学习记录失败"
        });
      }
    }
  );

  app.get("/api/runs/:id/learning", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      if (!runStore.findById(id)) {
        return reply.code(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "运行记录不存在"
        });
      }
      const record = learningStore.findByRunId(id);
      if (!record) {
        // 与「运行不存在」区分：前端把这条当正常空态处理
        return reply.code(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "该运行暂无学习记录"
        });
      }
      return record;
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({
        statusCode: 500,
        error: "Internal Server Error",
        message: "读取学习记录失败"
      });
    }
  });

  return app;
}
