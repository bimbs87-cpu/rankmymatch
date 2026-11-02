import { describe, expect, it } from "vitest";
import { processDeletionRequest, type DeletionOps, type DeletionStep } from "./account-deletion-runner";

function fakeOps(failOn: Partial<Record<DeletionStep, number>> = {}) {
  const calls: DeletionStep[] = [];
  const state = { status: "processing", steps: [] as string[], error: null as string | null };
  const remaining = { ...failOn };
  const ops: DeletionOps = {
    async runStep(step) {
      calls.push(step);
      if ((remaining[step] ?? 0) > 0) {
        remaining[step]!--;
        throw Object.assign(new Error("boom"), { code: "503" });
      }
    },
    async recordStep(_id, steps) {
      state.steps = steps;
    },
    async markExecuted() {
      state.status = "executed";
    },
    async markFailed(_id, code) {
      state.status = "failed";
      state.error = code;
    },
  };
  return { ops, calls, state };
}

describe("account deletion processing", () => {
  it("marks executed only after every step including identity verification", async () => {
    const { ops, calls, state } = fakeOps();
    const out = await processDeletionRequest({ id: "r", user_id: "u", completed_steps: [] }, ops);
    expect(out.status).toBe("executed");
    expect(calls).toEqual(["personal_data", "profile", "auth_identity", "verify_identity"]);
    expect(state.status).toBe("executed");
  });

  it("a failing login removal is never reported as executed", async () => {
    const { ops, state } = fakeOps({ auth_identity: 1 });
    const out = await processDeletionRequest({ id: "r", user_id: "u", completed_steps: [] }, ops);
    expect(out).toEqual({ status: "failed", step: "auth_identity", code: "auth_identity:503" });
    expect(state.status).toBe("failed");
    expect(state.steps).toEqual(["personal_data", "profile"]);
  });

  it("a retry resumes after the finished steps and then completes", async () => {
    const { ops, calls, state } = fakeOps();
    const out = await processDeletionRequest(
      { id: "r", user_id: "u", completed_steps: ["personal_data", "profile"] },
      ops,
    );
    expect(out.status).toBe("executed");
    expect(calls).toEqual(["auth_identity", "verify_identity"]);
    expect(state.status).toBe("executed");
  });

  it("re-running a fully processed request still re-verifies the identity", async () => {
    const { ops, calls } = fakeOps();
    await processDeletionRequest(
      { id: "r", user_id: "u", completed_steps: ["personal_data", "profile", "auth_identity", "verify_identity"] },
      ops,
    );
    expect(calls).toEqual(["verify_identity"]);
  });

  it("an identity that still exists keeps the request failed", async () => {
    const { ops, state } = fakeOps({ verify_identity: 1 });
    const out = await processDeletionRequest({ id: "r", user_id: "u", completed_steps: [] }, ops);
    expect(out.status).toBe("failed");
    expect(state.status).toBe("failed");
  });

  it("stored error codes contain no personal data", async () => {
    const { ops, state } = fakeOps();
    ops.runStep = async () => {
      throw Object.assign(new Error("user joao@x.com"), { code: "joao@x.com" });
    };
    await processDeletionRequest({ id: "r", user_id: "u", completed_steps: [] }, ops);
    expect(state.error).not.toContain("@");
  });
});
