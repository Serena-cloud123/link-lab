import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RunInput, RunRecord } from "@link-lab/contracts";
import { buildServer } from "../src/app";
import { resolveDatabasePath } from "../src/db";

const baseInput: RunInput = {
  scenarioId: "campus-registration",
  conditions: { O: "open", T: "granted" },
  defenses: ["D1", "D3"]
};

function postRun(app: FastifyInstance, input: unknown) {
  return app.inject({
    method: "POST",
    url: "/api/runs",
    payload: input as RunInput
  });
}

function countRows(dbPath: string): number {
  const db = new DatabaseSync(dbPath);
  try {
    const row = db.prepare("SELECT COUNT(*) AS count FROM runs").get() as {
      count: number | bigint;
    };
    return Number(row.count);
  } finally {
    db.close();
  }
}

describe("POST /api/runs 与 GET /api/runs/:id", () => {
  let dir: string;
  let dbPath: string;
  let app: FastifyInstance;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "link-lab-runs-"));
    dbPath = join(dir, "link-lab.db");
    app = buildServer({ logger: false }, { dbPath });
  });

  afterAll(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("合法输入由服务器重算并写入一条完整记录，返回 201", async () => {
    const response = await postRun(app, baseInput);
    expect(response.statusCode).toBe(201);

    const record = response.json() as RunRecord;
    expect(record.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(record.savedAt).toBeTypeOf("string");
    expect(Number.isNaN(Date.parse(record.savedAt))).toBe(false);
    expect(record.scenarioId).toBe("campus-registration");
    expect(record.scenarioVersion).toBe(1);
    expect(record.input).toEqual(baseInput);
    expect(record.result.events).toHaveLength(8);
    expect(record.result.pathResults).toEqual([
      {
        pathId: "A",
        outcome: "blocked",
        firstBlockedStepId: "A3",
        blockedReason: "D1 已开启，管理导出接口拒绝请求"
      },
      { pathId: "B", outcome: "reached" }
    ]);
    expect(record.result.alertCount).toBe(2);
    expect(record.explanationSource).toBe("template");
    expect(record.explanationVersion).toBe(1);
    expect(record.explanation).toContain("路径 A 在 A3 被阻断");
    expect(record.explanation).toContain("D1 已开启，管理导出接口拒绝请求");
    expect(record.explanation).toContain("路径 B 仍到达模拟数据");
    expect(record.explanation).toContain("D3 记录了 2 条敏感请求告警");
    expect(record.explanation).not.toContain("系统安全");
  });

  it("GET 按 id 返回保存时的完整记录", async () => {
    const created = (await postRun(app, baseInput)).json() as RunRecord;
    const before = countRows(dbPath);

    const response = await app.inject({
      method: "GET",
      url: `/api/runs/${created.id}`
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(created);
    expect(countRows(dbPath)).toBe(before);
  });

  it("GET 未知 id 返回 404", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/runs/not-a-real-run-id"
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      statusCode: 404,
      error: "Not Found",
      message: "运行记录不存在"
    });
  });

  it("严格校验失败返回 400，且不写库", async () => {
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
        label: "客户端伪造 result",
        input: {
          scenarioId: "campus-registration",
          conditions: { O: "open", T: "granted" },
          defenses: [],
          result: { events: [], pathResults: [], alertCount: 0 }
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

    const before = countRows(dbPath);
    for (const { input } of invalidCases) {
      const response = await postRun(app, input);
      expect(response.statusCode).toBe(400);
      expect(response.json()).not.toHaveProperty("result");
    }
    expect(countRows(dbPath)).toBe(before);
  });

  it("重启后使用同一文件仍能读到同一条记录", async () => {
    const restartDir = mkdtempSync(join(tmpdir(), "link-lab-restart-"));
    const restartDbPath = join(restartDir, "link-lab.db");
    let first: FastifyInstance | null = buildServer(
      { logger: false },
      { dbPath: restartDbPath }
    );
    let second: FastifyInstance | null = null;

    try {
      const created = (await postRun(first, baseInput)).json() as RunRecord;
      await first.close();
      first = null;

      second = buildServer({ logger: false }, { dbPath: restartDbPath });
      const response = await second.inject({
        method: "GET",
        url: `/api/runs/${created.id}`
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(created);
    } finally {
      if (first) await first.close();
      if (second) await second.close();
      rmSync(restartDir, { recursive: true, force: true });
    }
  });

  it("GET 只读：A 保存并关闭后外部改写库内结果与解释，B 返回哨兵值且行数不变", async () => {
    const sentinelDir = mkdtempSync(join(tmpdir(), "link-lab-sentinel-"));
    const sentinelDbPath = join(sentinelDir, "link-lab.db");
    let first: FastifyInstance | null = buildServer(
      { logger: false },
      { dbPath: sentinelDbPath }
    );
    let second: FastifyInstance | null = null;

    try {
      const created = (await postRun(first, baseInput)).json() as RunRecord;
      await first.close();
      first = null;

      const sentinelResult = {
        events: [],
        pathResults: [
          { pathId: "A", outcome: "reached" },
          {
            pathId: "B",
            outcome: "blocked",
            firstBlockedStepId: "B2",
            blockedReason: "哨兵阻断原因"
          }
        ],
        alertCount: 99
      };
      const sentinelExplanation = "哨兵解释：不得重新推演或重新生成";

      const writer = new DatabaseSync(sentinelDbPath);
      try {
        writer
          .prepare(
            "UPDATE runs SET result_json = ?, explanation = ? WHERE id = ?"
          )
          .run(JSON.stringify(sentinelResult), sentinelExplanation, created.id);
        const countBefore = Number(
          (
            writer.prepare("SELECT COUNT(*) AS count FROM runs").get() as {
              count: number | bigint;
            }
          ).count
        );

        second = buildServer({ logger: false }, { dbPath: sentinelDbPath });
        const response = await second.inject({
          method: "GET",
          url: `/api/runs/${created.id}`
        });
        expect(response.statusCode).toBe(200);

        const record = response.json() as RunRecord;
        expect(record.result).toEqual(sentinelResult);
        expect(record.explanation).toBe(sentinelExplanation);
        expect(countRows(sentinelDbPath)).toBe(countBefore);
      } finally {
        writer.close();
      }
    } finally {
      if (first) await first.close();
      if (second) await second.close();
      rmSync(sentinelDir, { recursive: true, force: true });
    }
  });
});

describe("数据库路径推导", () => {
  it("src 与 dist 入口推导到同一个 apps/api/data/link-lab.db", () => {
    const srcModule = new URL("../src/db.ts", import.meta.url);
    const distModule = new URL("../dist/db.js", import.meta.url);

    const fromSrc = resolveDatabasePath(srcModule, "");
    const fromDist = resolveDatabasePath(distModule, "");
    expect(fromSrc).toBe(fromDist);
    expect(fromSrc.replace(/\\/g, "/")).toMatch(
      /\/apps\/api\/data\/link-lab\.db$/
    );

    const relativeEnv = resolveDatabasePath(
      srcModule,
      "apps/api/data/custom.db"
    );
    expect(relativeEnv.replace(/\\/g, "/")).toMatch(
      /\/apps\/api\/data\/custom\.db$/
    );
  });
});
