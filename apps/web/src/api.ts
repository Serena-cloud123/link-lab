import type {
  LearningQuestion,
  LearningRecord,
  ListLearningQuestionsResponse,
  RunInput,
  RunRecord,
  RunResult,
  RunSummary,
  SaveLearningRequest,
  Scenario,
  VerifyRunResponse
} from "@link-lab/contracts";

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

export async function listRuns(): Promise<RunSummary[]> {
  let response: Response;
  try {
    response = await fetch("/api/runs");
  } catch (error) {
    throw new Error(
      `无法连接后端：${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (!response.ok) await throwHttpError(response);
  const body = (await response.json()) as { runs: RunSummary[] };
  return body.runs;
}

export async function getRun(id: string): Promise<RunRecord> {
  let response: Response;
  try {
    response = await fetch(`/api/runs/${id}`);
  } catch (error) {
    throw new Error(
      `无法连接后端：${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (!response.ok) await throwHttpError(response);
  return (await response.json()) as RunRecord;
}

/* ---------- 三题与学习记录 ---------- */

export async function getLearningQuestions(): Promise<LearningQuestion[]> {
  let response: Response;
  try {
    response = await fetch("/api/learning/questions");
  } catch (error) {
    throw new Error(
      `无法连接后端：${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (!response.ok) await throwHttpError(response);
  const body = (await response.json()) as ListLearningQuestionsResponse;
  return body.questions;
}

export async function saveLearning(
  request: SaveLearningRequest
): Promise<LearningRecord> {
  let response: Response;
  try {
    response = await fetch("/api/learning", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request)
    });
  } catch (error) {
    throw new Error(
      `无法连接后端：${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (!response.ok) await throwHttpError(response);
  return (await response.json()) as LearningRecord;
}

/**
 * 读取某条运行关联的学习记录。
 * 404 分两种：message「该运行暂无学习记录」是正常空态，返回 null；
 * message「运行记录不存在」或其他错误照常抛出。
 */
export async function getRunLearning(
  runId: string
): Promise<LearningRecord | null> {
  let response: Response;
  try {
    response = await fetch(`/api/runs/${runId}/learning`);
  } catch (error) {
    throw new Error(
      `无法连接后端：${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (response.status === 404) {
    let message: string | undefined;
    try {
      const body = (await response.json()) as { message?: string };
      message = body.message;
    } catch {
      message = undefined;
    }
    if (message === "该运行暂无学习记录") return null;
    throw new Error(`HTTP 404：${message ?? "未知错误"}`);
  }
  if (!response.ok) await throwHttpError(response);
  return (await response.json()) as LearningRecord;
}

/* ---------- 显式版本核对 ---------- */

/** 只读核对：POST 表达「执行一次核对」，后端不写库。 */
export async function verifyRun(id: string): Promise<VerifyRunResponse> {
  let response: Response;
  try {
    response = await fetch(`/api/runs/${id}/verify`, { method: "POST" });
  } catch (error) {
    throw new Error(
      `无法连接后端：${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (!response.ok) await throwHttpError(response);
  return (await response.json()) as VerifyRunResponse;
}
