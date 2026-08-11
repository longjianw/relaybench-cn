import { describe, expect, it } from "vitest";
import type { CaseAttemptResult, CaseResult, ProviderConfig } from "../shared/types";
import { aggregateCaseAttempts, summarizeProvider } from "./providers";

const provider: ProviderConfig = {
  id: "test",
  label: "测试线路",
  mode: "codex-current",
};

function attempt(attemptNumber: number, score: number): CaseAttemptResult {
  return {
    attempt: attemptNumber,
    status: score >= 80 ? "passed" : "failed",
    score,
    latencyMs: attemptNumber * 1_000,
    output: `output-${attemptNumber}`,
    detail: `detail-${attemptNumber}`,
    usage: { totalTokens: attemptNumber * 100 },
  };
}

describe("repeat aggregation", () => {
  it("reports pass rate, average score, spread, latency, and usage", () => {
    const result = aggregateCaseAttempts("case-a", [attempt(1, 100), attempt(2, 70), attempt(3, 90)]);

    expect(result.status).toBe("failed");
    expect(result.score).toBe(87);
    expect(result.stabilityRate).toBe(67);
    expect(result.scoreSpread).toBe(30);
    expect(result.latencyMs).toBe(2_000);
    expect(result.usage?.totalTokens).toBe(600);
    expect(result.attempts).toHaveLength(3);
  });

  it("does not count an unstable high-average case as a stable pass", () => {
    const unstable = aggregateCaseAttempts("case-a", [attempt(1, 100), attempt(2, 70), attempt(3, 100)]);
    const stable = aggregateCaseAttempts("case-b", [attempt(1, 100), attempt(2, 100), attempt(3, 100)]);
    const summary = summarizeProvider(provider, [unstable, stable] as CaseResult[]);

    expect(unstable.score).toBe(90);
    expect(summary.passed).toBe(1);
    expect(summary.eligible).toBe(2);
    expect(summary.stabilityRate).toBe(83);
  });
});
