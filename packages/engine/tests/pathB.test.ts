import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { DefenseId, PathEvent, PathResult, RunInput, Scenario, StepOutcome } from "@link-lab/contracts";
import { evaluatePathB } from "../src/pathB";

const scenario = JSON.parse(
  readFileSync(
    new URL("../../../scenarios/campus-registration/v1.json", import.meta.url),
    "utf8"
  )
) as Scenario;

function run(
  defenses: DefenseId[],
  conditions: RunInput["conditions"] = { O: "open", T: "granted" },
  presetId?: RunInput["presetId"]
) {
  return evaluatePathB(scenario, {
    scenarioId: "campus-registration",
    presetId,
    conditions,
    defenses
  });
}

interface Case {
  label: string;
  conditions: RunInput["conditions"];
  defenses: DefenseId[];
  b2Outcome: StepOutcome;
  b3Outcome: StepOutcome;
  b4Outcome: StepOutcome;
  b5Outcome: StepOutcome;
  hasAlert: boolean;
  pathOutcome: "reached" | "blocked";
  firstBlockedStepId?: string;
}

const cases: Case[] = [
  {
    label: "B2 被拒（O 关）",
    conditions: { O: "closed", T: "granted" },
    defenses: [],
    b2Outcome: "rejected",
    b3Outcome: "skipped",
    b4Outcome: "skipped",
    b5Outcome: "skipped",
    hasAlert: false,
    pathOutcome: "blocked",
    firstBlockedStepId: "B2"
  },
  {
    label: "全通过（O 开、T 有、D2 关、D3 关）",
    conditions: { O: "open", T: "granted" },
    defenses: [],
    b2Outcome: "passed",
    b3Outcome: "passed",
    b4Outcome: "passed",
    b5Outcome: "data-arrived",
    hasAlert: false,
    pathOutcome: "reached"
  },
  {
    label: "全通过 + D3 告警",
    conditions: { O: "open", T: "granted" },
    defenses: ["D3"],
    b2Outcome: "passed",
    b3Outcome: "passed",
    b4Outcome: "passed",
    b5Outcome: "data-arrived",
    hasAlert: true,
    pathOutcome: "reached"
  },
  {
    label: "T 拒绝 + D3 告警",
    conditions: { O: "open", T: "revoked" },
    defenses: ["D3"],
    b2Outcome: "passed",
    b3Outcome: "passed",
    b4Outcome: "passed",
    b5Outcome: "rejected",
    hasAlert: true,
    pathOutcome: "blocked",
    firstBlockedStepId: "B5"
  },
  {
    label: "D2 拒绝 + D3 告警",
    conditions: { O: "open", T: "granted" },
    defenses: ["D2", "D3"],
    b2Outcome: "passed",
    b3Outcome: "passed",
    b4Outcome: "passed",
    b5Outcome: "rejected",
    hasAlert: true,
    pathOutcome: "blocked",
    firstBlockedStepId: "B5"
  },
  {
    label: "T 与 D2 双拒 + D3 告警",
    conditions: { O: "open", T: "revoked" },
    defenses: ["D2", "D3"],
    b2Outcome: "passed",
    b3Outcome: "passed",
    b4Outcome: "passed",
    b5Outcome: "rejected",
    hasAlert: true,
    pathOutcome: "blocked",
    firstBlockedStepId: "B5"
  }
];

describe("evaluatePathB", () => {
  it.each(cases)("$label", ({
    conditions,
    defenses,
    b2Outcome,
    b3Outcome,
    b4Outcome,
    b5Outcome,
    hasAlert,
    pathOutcome,
    firstBlockedStepId
  }) => {
    const { events, pathResult } = run(defenses, conditions);

    expect(events.map((event) => event.eventIndex)).toEqual([3, 4, 5, 6, 7]);
    expect(events.map((event) => event.stepId)).toEqual(["B1", "B2", "B3", "B4", "B5"]);
    expect(events.every((event) => event.pathId === "B")).toBe(true);

    expect(events[0]).toMatchObject({
      fromNodeId: "N1",
      toNodeId: "N2",
      outcome: "passed",
      conditionChecks: []
    });

    expect(events[1]).toMatchObject({
      fromNodeId: "N2",
      toNodeId: "N4",
      outcome: b2Outcome
    });
    expect(events[1].conditionChecks).toHaveLength(1);
    expect(events[1].conditionChecks[0]).toMatchObject({
      id: "O",
      actualValue: conditions.O,
      satisfied: conditions.O === "open"
    });

    expect(events[2]).toMatchObject({
      fromNodeId: "N4",
      toNodeId: "N5",
      outcome: b3Outcome,
      conditionChecks: []
    });

    expect(events[3]).toMatchObject({
      fromNodeId: "N5",
      toNodeId: "N6",
      outcome: b4Outcome,
      conditionChecks: []
    });

    if (hasAlert) {
      expect(events[3].alert).toMatchObject({
        defenseId: "D3",
        interfaceNodeId: "N6"
      });
    } else {
      expect(events[3].alert).toBeUndefined();
    }

    expect(events[4]).toMatchObject({
      fromNodeId: "N6",
      toNodeId: "N7",
      outcome: b5Outcome
    });

    if (b2Outcome === "rejected") {
      expect(events[4].conditionChecks).toHaveLength(0);
    } else {
      expect(events[4].conditionChecks).toHaveLength(2);
      const tCheck = events[4].conditionChecks.find((c) => c.id === "T");
      const d2Check = events[4].conditionChecks.find((c) => c.id === "D2");
      expect(tCheck).toMatchObject({
        actualValue: conditions.T,
        satisfied: conditions.T === "granted"
      });
      expect(d2Check).toMatchObject({
        actualValue: defenses.includes("D2"),
        satisfied: !defenses.includes("D2")
      });
    }

    expect(events.filter((event) => event.alert)).toHaveLength(hasAlert ? 1 : 0);

    expect(pathResult.pathId).toBe("B");
    expect(pathResult.outcome).toBe(pathOutcome);

    if (pathOutcome === "blocked") {
      expect(pathResult.firstBlockedStepId).toBe(firstBlockedStepId);
      expect(pathResult.blockedReason).toBeTruthy();
    } else {
      expect(pathResult.firstBlockedStepId).toBeUndefined();
      expect(pathResult.blockedReason).toBeUndefined();
    }
  });

  it("D1 开关不改变 B 的事件与路径结果", () => {
    const conditions: RunInput["conditions"] = { O: "open", T: "granted" };
    const withD1 = run(["D1"], conditions);
    const withoutD1 = run([], conditions);

    expect(withD1.events).toEqual(withoutD1.events);
    expect(withD1.pathResult).toEqual(withoutD1.pathResult);
  });

  it("presetId 不改变 B 的事件与路径结果；以 input.conditions 为准", () => {
    const conditions: RunInput["conditions"] = { O: "closed", T: "revoked" };

    const withPresetA = run([], conditions, "A");
    const withPresetB = run([], conditions, "B");
    const withPresetC = run([], conditions, "C");
    const noPreset = run([], conditions);

    expect(withPresetA.events).toEqual(noPreset.events);
    expect(withPresetB.events).toEqual(noPreset.events);
    expect(withPresetC.events).toEqual(noPreset.events);
    expect(withPresetA.pathResult).toEqual(noPreset.pathResult);
    expect(withPresetB.pathResult).toEqual(noPreset.pathResult);
    expect(withPresetC.pathResult).toEqual(noPreset.pathResult);
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
  it("32 行 pathBReached 全部一致（不比较其他字段）", () => {
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
      const expected = row.pathBReached === "1" ? "reached" : "blocked";

      expect(pathResult.outcome, row.caseId).toBe(expected);
    }
  });
});
