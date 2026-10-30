import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RunInput, RunResult } from "@link-lab/contracts";
import { buildServer } from "../src/app";

let app: FastifyInstance;

beforeAll(async () => {
  app = buildServer({ logger: false });
});

afterAll(async () => {
  await app.close();
});

function postEvaluation(input: unknown) {
  return app.inject({
    method: "POST",
    url: "/api/evaluations",
    payload: input as RunInput
  });
}

const baseInput: RunInput = {
  scenarioId: "campus-registration",
  conditions: { O: "open", T: "granted" },
  defenses: ["D1", "D3"]
};

describe("GET /health", () => {
  it("保持原有响应", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "ok",
      service: "@link-lab/api"
    });
  });
});

describe("GET /api/scenarios/campus-registration", () => {
  it("返回固定场景的完整结构，且不含预填 outcome", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/scenarios/campus-registration"
    });
    expect(response.statusCode).toBe(200);

    const scenario = response.json();
    expect(scenario.id).toBe("campus-registration");
    expect(scenario.version).toBe(1);
    expect(typeof scenario.boundary).toBe("string");
    expect(scenario.nodes).toHaveLength(7);
    expect(scenario.paths.map((path: { id: string }) => path.id)).toEqual([
      "A",
      "B"
    ]);
    expect(Object.keys(scenario.initialConditions)).toEqual(["O", "T"]);
    expect(Object.keys(scenario.defenses)).toEqual(["D1", "D2", "D3"]);
    expect(scenario.presets.map((preset: { id: string }) => preset.id)).toEqual([
      "A",
      "B",
      "C"
    ]);
    expect(response.body).not.toContain("outcome");
  });
});

describe("POST /api/evaluations", () => {
  it("A-101 返回 A blocked、B reached、2 个告警", async () => {
    const response = await postEvaluation(baseInput);
    expect(response.statusCode).toBe(200);

    const result = response.json() as RunResult;
    expect(result.events).toHaveLength(8);
    expect(result.pathResults).toEqual([
      {
        pathId: "A",
        outcome: "blocked",
        firstBlockedStepId: "A3",
        blockedReason: "D1 已开启，管理导出接口拒绝请求"
      },
      { pathId: "B", outcome: "reached" }
    ]);
    expect(result.alertCount).toBe(2);
  });

  it("B-001 返回 A reached、B blocked、1 个告警", async () => {
    const input: RunInput = {
      scenarioId: "campus-registration",
      conditions: { O: "closed", T: "granted" },
      defenses: ["D3"]
    };
    const response = await postEvaluation(input);
    expect(response.statusCode).toBe(200);

    const result = response.json() as RunResult;
    expect(result.pathResults).toEqual([
      { pathId: "A", outcome: "reached" },
      {
        pathId: "B",
        outcome: "blocked",
        firstBlockedStepId: "B2",
        blockedReason: "诊断页面对普通账号关闭，访问被拒绝"
      }
    ]);
    expect(result.alertCount).toBe(1);
    expect(
      result.events.filter((event) => event.outcome === "rejected").map((event) => event.stepId)
    ).toEqual(["B2"]);
    expect(
      result.events.filter((event) => event.outcome === "skipped").map((event) => event.stepId)
    ).toEqual(["B3", "B4", "B5"]);
  });

  it("presetId 只记录起始预设，不覆盖 conditions", async () => {
    const withoutPreset = await postEvaluation(baseInput);
    expect(withoutPreset.statusCode).toBe(200);
    const expected = withoutPreset.json() as RunResult;

    for (const presetId of ["A", "B", "C"] as const) {
      const response = await postEvaluation({ ...baseInput, presetId });
      expect(response.statusCode).toBe(200);
      expect(response.json() as RunResult).toEqual(expected);
    }
  });
});

describe("POST /api/evaluations 输入校验返回 400", () => {
  const invalidCases: Array<{ label: string; input: unknown }> = [
    {
      label: "缺 defenses",
      input: {
        scenarioId: "campus-registration",
        conditions: { O: "open", T: "granted" }
      }
    },
    {
      label: "缺 conditions.T",
      input: {
        scenarioId: "campus-registration",
        conditions: { O: "open" },
        defenses: []
      }
    },
    {
      label: "scenarioId 非法",
      input: {
        scenarioId: "other-scenario",
        conditions: { O: "open", T: "granted" },
        defenses: []
      }
    },
    {
      label: "O 非法",
      input: {
        scenarioId: "campus-registration",
        conditions: { O: "maybe", T: "granted" },
        defenses: []
      }
    },
    {
      label: "defenses 含 D4",
      input: {
        scenarioId: "campus-registration",
        conditions: { O: "open", T: "granted" },
        defenses: ["D4"]
      }
    },
    {
      label: "defenses 重复",
      input: {
        scenarioId: "campus-registration",
        conditions: { O: "open", T: "granted" },
        defenses: ["D1", "D1"]
      }
    },
    {
      label: "顶层多余字段",
      input: {
        scenarioId: "campus-registration",
        conditions: { O: "open", T: "granted" },
        defenses: [],
        extra: true
      }
    },
    {
      label: "conditions 内多余字段",
      input: {
        scenarioId: "campus-registration",
        conditions: { O: "open", T: "granted", extra: true },
        defenses: []
      }
    }
  ];

  it.each(invalidCases)("$label", async ({ input }) => {
    const response = await postEvaluation(input);
    expect(response.statusCode).toBe(400);

    const body = response.json();
    expect(body).not.toHaveProperty("events");
    expect(body).not.toHaveProperty("pathResults");
  });
});
