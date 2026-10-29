import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { DefenseId, RunInput, Scenario } from "@link-lab/contracts";
import { evaluateRun } from "../src/run";

const scenario = JSON.parse(
  readFileSync(
    new URL("../../../scenarios/campus-registration/v1.json", import.meta.url),
    "utf8"
  )
) as Scenario;

function buildInput(
  row: Record<string, string>,
  presetId?: RunInput["presetId"]
): RunInput {
  const defenses: DefenseId[] = [];
  if (row.D1 === "1") defenses.push("D1");
  if (row.D2 === "1") defenses.push("D2");
  if (row.D3 === "1") defenses.push("D3");

  const conditions: RunInput["conditions"] = {
    O: row.O === "1" ? "open" : "closed",
    T: row.T === "1" ? "granted" : "revoked"
  };

  return {
    scenarioId: "campus-registration",
    presetId,
    conditions,
    defenses
  };
}

const csvLines = readFileSync(
  new URL("./expected-runs.csv", import.meta.url),
  "utf8"
)
  .trim()
  .split(/\r?\n/);

const [headerLine, ...dataLines] = csvLines;
const header = headerLine.split(",");

const csvRows = dataLines.map((line) => {
  const cells = line.split(",");
  return Object.fromEntries(
    header.map((key, index) => [key, cells[index]])
  ) as Record<string, string>;
});

const findRow = (caseId: string) => {
  const row = csvRows.find((r) => r.caseId === caseId);
  if (!row) throw new Error(`CSV 中找不到 ${caseId}`);
  return row;
};

describe("evaluateRun", () => {
  it("scenarioId 不匹配时抛出错误", () => {
    const input: RunInput = {
      scenarioId: "wrong-id",
      conditions: { O: "open", T: "granted" },
      defenses: []
    };
    expect(() => evaluateRun(scenario, input)).toThrow(
      /场景 id 不匹配/
    );
  });

  it("始终有 8 个事件，eventIndex 为 0—7，步骤顺序 A1—A3 后 B1—B5", () => {
    const result = evaluateRun(scenario, buildInput(csvRows[0]));
    expect(result.events).toHaveLength(8);
    expect(result.events.map((e) => e.eventIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(result.events.map((e) => e.stepId)).toEqual([
      "A1", "A2", "A3", "B1", "B2", "B3", "B4", "B5"
    ]);
  });

  it("pathResults 顺序固定为 A 后 B", () => {
    for (const row of csvRows) {
      const result = evaluateRun(scenario, buildInput(row));
      expect(result.pathResults[0].pathId, `${row.caseId} pathResults[0].pathId`).toBe("A");
      expect(result.pathResults[1].pathId, `${row.caseId} pathResults[1].pathId`).toBe("B");
    }
  });

  it("presetId 不改变运行结果（events、pathResults、alertCount 完全相等）", () => {
    const baseInput = buildInput(findRow("A-101"));
    const base = evaluateRun(scenario, baseInput);

    for (const presetId of ["A", "B", "C"] as const) {
      const withPreset = evaluateRun(scenario, buildInput(findRow("A-101"), presetId));
      expect(withPreset.events, `presetId=${presetId} events`).toEqual(base.events);
      expect(withPreset.pathResults, `presetId=${presetId} pathResults`).toEqual(base.pathResults);
      expect(withPreset.alertCount, `presetId=${presetId} alertCount`).toBe(base.alertCount);
    }
  });

  describe("重点用例告警与阻断位置", () => {
    const cases: Array<{
      caseId: string;
      alertIndices: number[];
      rejectedSteps: string[];
      skippedSteps: string[];
    }> = [
      {
        caseId: "A-101",
        alertIndices: [1, 6],
        rejectedSteps: ["A3"],
        skippedSteps: []
      },
      {
        caseId: "B-001",
        alertIndices: [1],
        rejectedSteps: ["B2"],
        skippedSteps: ["B3", "B4", "B5"]
      },
      {
        caseId: "C-001",
        alertIndices: [1, 6],
        rejectedSteps: ["B5"],
        skippedSteps: []
      },
      {
        caseId: "X-111",
        alertIndices: [1],
        rejectedSteps: ["A3", "B2"],
        skippedSteps: ["B3", "B4", "B5"]
      }
    ];

    it.each(cases)("$caseId", ({ caseId, alertIndices, rejectedSteps, skippedSteps }) => {
      const result = evaluateRun(scenario, buildInput(findRow(caseId)));

      const actualAlertIndices = result.events
        .map((e, i) => (e.alert ? i : -1))
        .filter((i) => i >= 0);
      expect(actualAlertIndices, `${caseId} 告警位置`).toEqual(alertIndices);

      const actualRejected = result.events
        .filter((e) => e.outcome === "rejected")
        .map((e) => e.stepId);
      expect(actualRejected, `${caseId} rejected 步骤`).toEqual(rejectedSteps);

      const actualSkipped = result.events
        .filter((e) => e.outcome === "skipped")
        .map((e) => e.stepId);
      expect(actualSkipped, `${caseId} skipped 步骤`).toEqual(skippedSteps);
    });
  });
});

describe("expected-runs.csv 完整 32 行", () => {
  it("pathAReached、pathBReached、alertCount 三列全部一致", () => {
    expect(csvRows).toHaveLength(32);

    for (const row of csvRows) {
      const result = evaluateRun(scenario, buildInput(row));

      const expectedA = row.pathAReached === "1" ? "reached" : "blocked";
      const expectedB = row.pathBReached === "1" ? "reached" : "blocked";
      const expectedAlerts = Number(row.alertCount);

      expect(result.pathResults[0].outcome, `${row.caseId} pathAReached`).toBe(expectedA);
      expect(result.pathResults[1].outcome, `${row.caseId} pathBReached`).toBe(expectedB);
      expect(result.alertCount, `${row.caseId} alertCount`).toBe(expectedAlerts);
    }
  });
});
