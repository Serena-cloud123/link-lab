import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import type { RunInput, RunRecord, Scenario } from "@link-lab/contracts";
import { evaluateRun } from "@link-lab/engine";
import { createRunStore, openRunDatabase, resolveDatabasePath } from "./db.ts";
import {
  EXPLANATION_SOURCE,
  EXPLANATION_VERSION,
  buildRunExplanation
} from "./explanation.ts";

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

  return app;
}
