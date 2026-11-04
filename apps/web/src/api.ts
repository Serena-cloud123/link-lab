import type { RunInput, RunRecord, RunResult, Scenario } from "@link-lab/contracts";

async function throwHttpError(response: Response): Promise<never> {
  let detail = "";
  try {
    detail = await response.text();
  } catch {
    detail = "";
  }
  throw new Error(
    `HTTP ${response.status}${detail ? `：${detail}` : ""}`
  );
}

export async function fetchScenario(): Promise<Scenario> {
  let response: Response;
  try {
    response = await fetch("/api/scenarios/campus-registration");
  } catch (error) {
    throw new Error(
      `无法连接后端：${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (!response.ok) await throwHttpError(response);
  return (await response.json()) as Scenario;
}

export async function postEvaluation(input: RunInput): Promise<RunResult> {
  let response: Response;
  try {
    response = await fetch("/api/evaluations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    });
  } catch (error) {
    throw new Error(
      `无法连接后端：${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (!response.ok) await throwHttpError(response);
  return (await response.json()) as RunResult;
}

export async function saveRun(input: RunInput): Promise<RunRecord> {
  let response: Response;
  try {
    response = await fetch("/api/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    });
  } catch (error) {
    throw new Error(
      `无法连接后端：${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (!response.ok) await throwHttpError(response);
  return (await response.json()) as RunRecord;
}
