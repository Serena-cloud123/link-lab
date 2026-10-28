import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { DefenseId, RunInput, Scenario, StepOutcome } from "@link-lab/contracts";
import { evaluatePathA } from "../src/pathA";

const scenario = JSON.parse(
  readFileSync(
    new URL("../../../scenarios/campus-registration/v1.json", import.meta.url),
    "utf8"
  )
) as Scenario;

function run(
  defenses: DefenseId[],
  conditions: RunInput["conditions"] = { O: "open", T: "granted" }
) {
  return evaluatePathA(scenario, {
    scenarioId: "campus-registration",
    conditions,
    defenses
  });
}

interface Case {
  label: string;
  defenses: DefenseId[];
  a3Outcome: StepOutcome;
  hasAlert: boolean;
  pathOutcome: "reached" | "blocked";
}

const cases: Case[] = [
  {
    label: "D1 关、D3 关",
    defenses: [],
    a3Outcome: "data-arrived",
    hasAlert: false,
    pathOutcome: "reached"
  },
  {
    label: "D1 关、D3 开",
    defenses: ["D3"],
    a3Outcome: "data-arrived",
    hasAlert: true,
    pathOutcome: "reached"
  },
  {
    label: "D1 开、D3 关",
    defenses: ["D1"],
    a3Outcome: "rejected",
    hasAlert: false,
    pathOutcome: "blocked"
  },
  {
    label: "D1 开、D3 开",
    defenses: ["D1", "D3"],
    a3Outcome: "rejected",
    hasAlert: true,
    pathOutcome: "blocked"
  }
];

describe("evaluatePathA", () => {
  it.each(cases)("$label", ({ defenses, a3Outcome, hasAlert, pathOutcome }) => {
    const d1Enabled = defenses.includes("D1");
    const { events, pathResult } = run(defenses);

    expect(events.map((event) => event.eventIndex)).toEqual([0, 1, 2]);
    expect(events.map((event) => event.stepId)).toEqual(["A1", "A2", "A3"]);
    expect(events.every((event) => event.pathId === "A")).toBe(true);

    expect(events[0]).toMatchObject({
      fromNodeId: "N1",
      toNodeId: "N2",
      outcome: "passed",
      conditionChecks: []
    });

    expect(events[1]).toMatchObject({
      fromNodeId: "N2",
      toNodeId: "N3",
      outcome: "passed",
      conditionChecks: []
    });

    expect(events[2]).toMatchObject({
      fromNodeId: "N3",
      toNodeId: "N7",
      outcome: a3Outcome,
      conditionChecks: [
        {
          id: "D1",
          actualValue: d1Enabled,
          satisfied: !d1Enabled
        }
      ]
    });

    if (hasAlert) {
      expect(events[1].alert).toMatchObject({
        defenseId: "D3",
        interfaceNodeId: "N3"
      });
    } else {
      expect(events[1].alert).toBeUndefined();
    }

    expect(events.filter((event) => event.alert)).toHaveLength(hasAlert ? 1 : 0);

    expect(pathResult.pathId).toBe("A");
    expect(pathResult.outcome).toBe(pathOutcome);

    if (pathOutcome === "blocked") {
      expect(pathResult.firstBlockedStepId).toBe("A3");
      expect(pathResult.blockedReason).toBeTruthy();
    } else {
      expect(pathResult.firstBlockedStepId).toBeUndefined();
      expect(pathResult.blockedReason).toBeUndefined();
    }
  });
});

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

describe("expected-runs.csv", () => {
  it("32 行 pathAReached 全部一致（不比较其他字段）", () => {
    expect(csvRows).toHaveLength(32);

    for (const row of csvRows) {
      const defenses: DefenseId[] = [];
      if (row.D1 === "1") defenses.push("D1");
      if (row.D2 === "1") defenses.push("D2");
      if (row.D3 === "1") defenses.push("D3");

      const conditions: RunInput["conditions"] = {
        O: row.O === "1" ? "open" : "closed",
        T: row.T === "1" ? "granted" : "revoked"
      };

      const { pathResult } = run(defenses, conditions);
      const expected = row.pathAReached === "1" ? "reached" : "blocked";

      expect(pathResult.outcome, row.caseId).toBe(expected);
    }
  });
});
