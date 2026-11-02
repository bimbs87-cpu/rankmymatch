/**
 * Pure orchestration for one account-deletion request. Storage access is
 * injected so the retry/idempotency rules can be tested without a database.
 *
 * Rules:
 * - Steps run in a fixed order; finished steps are recorded and skipped on retry.
 * - Any error leaves the request "failed" (retryable) — never "executed".
 * - "executed" is written only after the login identity is confirmed gone.
 */
export const DELETION_STEPS = ["personal_data", "profile", "auth_identity", "verify_identity"] as const;
export type DeletionStep = (typeof DELETION_STEPS)[number];

export interface DeletionRequest {
  id: string;
  user_id: string;
  completed_steps: string[];
}

export interface DeletionOps {
  runStep(step: DeletionStep, userId: string): Promise<void>;
  recordStep(requestId: string, steps: string[]): Promise<void>;
  markExecuted(requestId: string): Promise<void>;
  markFailed(requestId: string, code: string): Promise<void>;
}

export type DeletionOutcome = { status: "executed" } | { status: "failed"; step: DeletionStep | "finalize"; code: string };

/** Short, non-personal error code safe to store and log. */
export function toErrorCode(step: string, err: unknown): string {
  const raw = err as { code?: unknown; status?: unknown; name?: unknown } | null;
  const code = raw?.code ?? raw?.status ?? raw?.name ?? "error";
  return `${step}:${String(code).replace(/[^\w.-]/g, "").slice(0, 40) || "error"}`;
}

export async function processDeletionRequest(req: DeletionRequest, ops: DeletionOps): Promise<DeletionOutcome> {
  const done = new Set(req.completed_steps ?? []);
  for (const step of DELETION_STEPS) {
    // Identity verification always re-runs: it is the proof of completion.
    if (done.has(step) && step !== "verify_identity") continue;
    try {
      await ops.runStep(step, req.user_id);
      done.add(step);
      await ops.recordStep(req.id, DELETION_STEPS.filter((s) => done.has(s)));
    } catch (err) {
      const code = toErrorCode(step, err);
      await ops.markFailed(req.id, code);
      return { status: "failed", step, code };
    }
  }
  try {
    await ops.markExecuted(req.id);
  } catch (err) {
    const code = toErrorCode("finalize", err);
    await ops.markFailed(req.id, code).catch(() => undefined);
    return { status: "failed", step: "finalize", code };
  }
  return { status: "executed" };
}
