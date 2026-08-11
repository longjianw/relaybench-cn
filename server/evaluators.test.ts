import { describe, expect, it } from "vitest";
import {
  evaluateContains,
  evaluateExactNumber,
  evaluateExactText,
  evaluateStructuredJson,
} from "./evaluators";

describe("evaluators", () => {
  it("accepts a single exact number", () => {
    expect(evaluateExactNumber("7429", 7429).score).toBe(100);
    expect(evaluateExactNumber("答案是 7429", 7429).score).toBe(0);
  });

  it("grades exact line constraints", () => {
    expect(evaluateExactText("ALPHA\nBETA\nGAMMA", "ALPHA\nBETA\nGAMMA").score).toBe(100);
  });

  it("validates structured JSON", () => {
    expect(evaluateStructuredJson('{"status":"ok","count":3,"items":["A","B","C"]}').score).toBe(100);
    expect(evaluateStructuredJson("not json").score).toBe(0);
  });

  it("finds a unique context marker", () => {
    expect(evaluateContains("MED-AI-7429", "MED-AI-7429").score).toBe(100);
  });
});
