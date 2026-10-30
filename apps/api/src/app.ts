import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import type { RunInput, Scenario } from "@link-lab/contracts";
import { evaluateRun } from "@link-lab/engine";

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

export function buildServer(
  options: FastifyServerOptions = { logger: true }
): FastifyInstance {
  const app = Fastify({
    ...options,
    // Fastify 默认 removeAdditional 会静默删除多余字段，这里改为直接返回 400。
    ajv: { customOptions: { removeAdditional: false } }
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

  return app;
}
