import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { RunInput, RunRecord, RunSummary } from "@link-lab/contracts";
import * as engine from "@link-lab/engine";
import { buildServer } from "../src/app";

const baseInput: RunInput = {
  scenarioId: "campus-registration",
  conditions: { O: "open", T: "granted" },
  defenses: ["D1", "D3"]
};

const altInput: RunInput = {
  scenarioId: "campus-registration",
  conditions: { O: "open", T: "revoked" },
  defenses: ["D2"]
};

const thirdInput: RunInput = {
  scenarioId: "campus-registration",
  conditions: { O: "closed", T: "granted" },
  defenses: []
};

function postRun(app: FastifyInstance, input: unknown) {
  return app.inject({
    method: "POST",
    url: "/api/runs",
    payload: input as RunInput
  });
}

describe("GET /api/runs — 历史列表", () => {
  let dir: string;
  let dbPath: string;
  let app: FastifyInstance;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "link-lab-list-"));
    dbPath = join(dir, "link-lab.db");
    app = buildServer({ logger: false }, { dbPath });
  });

  afterAll(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("空库返回空数组", async () => {
    const response = await app.inject({ method: "GET", url: "/api/runs" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ runs: [] });
  });

  it("多条记录按 saved_at DESC 排序，并列时 rowid DESC 作为次级排序", async () => {
    const first = (await postRun(app, baseInput)).json() as RunRecord;
    // 间隔足够大保证 savedAt 不同
    await new Promise((r) => setTimeout(r, 20));
    const second = (await postRun(app, altInput)).json() as RunRecord;
    await new Promise((r) => setTimeout(r, 20));
    const third = (await postRun(app, thirdInput)).json() as RunRecord;

    const response = await app.inject({ method: "GET", url: "/api/runs" });
    expect(response.statusCode).toBe(200);

    const { runs } = response.json() as { runs: RunSummary[] };
    expect(runs).toHaveLength(3);

    // 最新的在最前
    expect(runs[0].id).toBe(third.id);
    expect(runs[1].id).toBe(second.id);
    expect(runs[2].id).toBe(first.id);

    // 每个摘要有正确的字段
    for (const summary of runs) {
      expect(summary).not.toHaveProperty("events");
      expect(summary).not.toHaveProperty("result");
      expect(summary).not.toHaveProperty("explanation");
      expect(summary.scenarioId).toBe("campus-registration");
      expect(summary.scenarioVersion).toBe(1);
      expect(summary.conditions).toBeDefined();
      expect(summary.defenses).toBeDefined();
      expect(summary.pathResults).toBeDefined();
      expect(summary.alertCount).toBeTypeOf("number");
    }

    // second 的 defenses 是 ["D2"]
    expect(runs[1].defenses).toEqual(["D2"]);
  });

  it("返回的 pathResults 包含正确的阻断信息", async () => {
    // baseInput: D1 + D3 → A blocked(A3)，B reached，2 alerts
    const response = await app.inject({ method: "GET", url: "/api/runs" });
    const { runs } = response.json() as { runs: RunSummary[] };
    const baseSummary = runs.find(
      (r) => r.defenses.includes("D1") && r.defenses.includes("D3")
    );
    expect(baseSummary).toBeDefined();

    const pathA = baseSummary!.pathResults.find((p) => p.pathId === "A");
    const pathB = baseSummary!.pathResults.find((p) => p.pathId === "B");
    expect(pathA).toEqual({
      pathId: "A",
      outcome: "blocked",
      firstBlockedStepId: "A3",
      blockedReason: "D1 已开启，管理导出接口拒绝请求"
    });
    expect(pathB).toEqual({ pathId: "B", outcome: "reached" });
    expect(baseSummary!.alertCount).toBe(2);
  });

  it("列表端点不调用 evaluateRun（mock 引擎验证）", async () => {
    // 注意：buildServer 在模块加载时已导入 evaluateRun，这里验证的是
    // GET /api/runs 处理器本身不触发引擎调用
    const originalEvaluateRun = engine.evaluateRun;
    const mockEvaluateRun = vi.fn();

    try {
      // 直接调用 runStore.listRuns() 验证它只是 SQL 查询，不调引擎
      // 换一个全新的 app 来测，避开已有的 POST 调用记录
      const freshDir = mkdtempSync(join(tmpdir(), "link-lab-list-mock-"));
      const freshDbPath = join(freshDir, "link-lab.db");
      const freshApp = buildServer({ logger: false }, { dbPath: freshDbPath });
      try {
        // 先 POST 一条（用真实引擎）
        await postRun(freshApp, baseInput);

        // 然后 mock 引擎并调列表
        vi.spyOn(engine, "evaluateRun");
        const callCountBefore = (engine.evaluateRun as unknown as ReturnType<typeof vi.fn>).mock
          ?.calls.length ?? 0;

        const listResponse = await freshApp.inject({
          method: "GET",
          url: "/api/runs"
        });
        expect(listResponse.statusCode).toBe(200);

        const callCountAfter = (engine.evaluateRun as unknown as ReturnType<typeof vi.fn>).mock
          ?.calls.length ?? 0;
        // 列表请求不应新增任何引擎调用
        expect(callCountAfter).toBe(callCountBefore);
      } finally {
        await freshApp.close();
        rmSync(freshDir, { recursive: true, force: true });
        mockEvaluateRun.mockRestore?.();
        void originalEvaluateRun;
      }
    } finally {
      vi.restoreAllMocks();
    }
  });
});
