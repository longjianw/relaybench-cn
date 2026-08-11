import type { BenchmarkCaseSummary, BenchmarkKind } from "../shared/types";
import {
  evaluateContains,
  evaluateExactNumber,
  evaluateExactText,
  evaluateStructuredJson,
} from "./evaluators";

export interface BenchmarkDefinition extends BenchmarkCaseSummary {
  prompt: string;
  maxOutputTokens: number;
  evaluate?: (output: string) => { score: number; detail: string };
  workspace?: {
    files: Record<string, string>;
    hiddenFiles?: Record<string, string>;
    instruction: string;
    testCommand: [string, string[]];
  };
}

const contextLines = Array.from({ length: 80 }, (_, index) => {
  const value = String(index + 1).padStart(2, "0");
  return `记录 ${value}：样本批次 B-${value}，状态为已归档。`;
});
contextLines.splice(57, 0, "关键记录：本轮验证口令是 MED-AI-7429，请只记住这一项。");

const definitions: BenchmarkDefinition[] = [
  {
    id: "arithmetic-exact",
    title: "精确计算",
    category: "推理",
    description: "检查基础计算和只输出答案的约束遵循。",
    kind: "response",
    estimatedSeconds: 8,
    maxOutputTokens: 64,
    prompt: "只输出最终整数，不要解释，不要使用 Markdown。计算：(137 × 53) + 168。",
    evaluate: (output) => evaluateExactNumber(output, 7429),
  },
  {
    id: "structured-json",
    title: "结构化输出",
    category: "可靠性",
    description: "检查严格 JSON 输出和字段准确性。",
    kind: "response",
    estimatedSeconds: 8,
    maxOutputTokens: 128,
    prompt:
      '只输出一个合法 JSON 对象，不要代码块或解释。必须精确包含：status 为 "ok"，count 为 3，items 为字符串数组 ["A","B","C"]。',
    evaluate: evaluateStructuredJson,
  },
  {
    id: "instruction-format",
    title: "指令遵循",
    category: "控制力",
    description: "检查行数、顺序和禁止附加解释的约束。",
    kind: "response",
    estimatedSeconds: 8,
    maxOutputTokens: 96,
    prompt:
      "输出恰好三行，不要序号、标点、代码块或其他文字。第一行必须是 ALPHA，第二行必须是 BETA，第三行必须是 GAMMA。",
    evaluate: (output) => evaluateExactText(output, "ALPHA\nBETA\nGAMMA"),
  },
  {
    id: "context-recall",
    title: "长文本找回",
    category: "上下文",
    description: "检查较长输入中的精确信息提取能力。",
    kind: "response",
    estimatedSeconds: 12,
    maxOutputTokens: 64,
    prompt: `${contextLines.join("\n")}\n\n问题：验证口令是什么？只输出口令本身。`,
    evaluate: (output) => evaluateContains(output.trim(), "MED-AI-7429"),
  },
  {
    id: "source-boundary",
    title: "来源边界判断",
    category: "医疗文本安全",
    description: "检查既往记录是否会被错误当成本次医生确认事实。",
    kind: "response",
    estimatedSeconds: 10,
    maxOutputTokens: 96,
    prompt: `以下是完全合成的文书片段：
[既往出院记录] 出院诊断：社区获得性肺炎。
[本次入院患者自述] 近两日反复发热，最高体温未提供。
[本次入院医生确认] 初步诊断：发热待查。

问题：只输出本次入院医生已经明确确认的初步诊断，不得采用既往出院诊断，不要解释。`,
    evaluate: (output) => evaluateExactText(output, "发热待查"),
  },
  {
    id: "workspace-bugfix",
    title: "真实代码修复",
    category: "编程智能体",
    description: "在临时项目中修复分诊优先级函数，并通过隐藏测试。",
    kind: "workspace",
    estimatedSeconds: 45,
    maxOutputTokens: 512,
    prompt: "",
    workspace: {
      instruction:
        "修复 src/triage.js 中的 priority 函数。要求：urgent 为 true 时始终返回 'critical'；否则 score >= 8 返回 'high'，score >= 4 返回 'medium'，其余返回 'low'。不要修改测试文件。完成后运行测试。",
      files: {
        "package.json": JSON.stringify(
          {
            name: "relaybench-triage-task",
            private: true,
            type: "module",
            scripts: { test: "node --test" },
          },
          null,
          2,
        ),
        "src/triage.js": `export function priority(score, urgent) {
  if (urgent && score > 8) return "critical";
  if (score > 8) return "high";
  if (score > 4) return "medium";
  return "low";
}
`,
        "test/triage.test.js": `import test from "node:test";
import assert from "node:assert/strict";
import { priority } from "../src/triage.js";

test("visible examples", () => {
  assert.equal(priority(10, false), "high");
  assert.equal(priority(6, false), "medium");
  assert.equal(priority(2, false), "low");
});
`,
      },
      hiddenFiles: {
        "test/hidden.test.js": `import test from "node:test";
import assert from "node:assert/strict";
import { priority } from "../src/triage.js";

test("boundary and urgent behavior", () => {
  assert.equal(priority(1, true), "critical");
  assert.equal(priority(8, false), "high");
  assert.equal(priority(4, false), "medium");
  assert.equal(priority(3, false), "low");
});
`,
      },
      testCommand: ["node", ["--test"]],
    },
  },
  {
    id: "workspace-timeline",
    title: "事件时间线归一化",
    category: "编程智能体",
    description: "修复去重、日期校验、稳定排序和输入不可变性问题。",
    kind: "workspace",
    estimatedSeconds: 60,
    maxOutputTokens: 768,
    prompt: "",
    workspace: {
      instruction:
        "修复 src/events.js 中的 normalizeEvents(events)。要求：按 id 去重并保留 updatedAt 最新的版本；丢弃 when 不是有效 ISO 日期的记录；按 when 升序排序，同一时间按 id 字典序；返回对象仅包含 id、when、value；不得修改输入数组或其中对象。不要修改测试文件，完成后运行测试。",
      files: {
        "package.json": JSON.stringify(
          {
            name: "relaybench-timeline-task",
            private: true,
            type: "module",
            scripts: { test: "node --test" },
          },
          null,
          2,
        ),
        "src/events.js": `export function normalizeEvents(events) {
  return events
    .filter((event) => event.when)
    .sort((left, right) => left.when.localeCompare(right.when));
}
`,
        "test/events.test.js": `import test from "node:test";
import assert from "node:assert/strict";
import { normalizeEvents } from "../src/events.js";

test("sorts a basic timeline", () => {
  const result = normalizeEvents([
    { id: "b", when: "2026-08-02T09:00:00Z", updatedAt: "2026-08-02T10:00:00Z", value: "B" },
    { id: "a", when: "2026-08-01T09:00:00Z", updatedAt: "2026-08-01T10:00:00Z", value: "A" },
  ]);
  assert.deepEqual(result.map((event) => event.id), ["a", "b"]);
});
`,
      },
      hiddenFiles: {
        "test/hidden.test.js": `import test from "node:test";
import assert from "node:assert/strict";
import { normalizeEvents } from "../src/events.js";

test("deduplicates, validates, sorts ties, strips metadata, and preserves input", () => {
  const input = [
    { id: "b", when: "2026-08-02T09:00:00Z", updatedAt: "2026-08-02T10:00:00Z", value: "old", extra: 1 },
    { id: "b", when: "2026-08-02T08:00:00Z", updatedAt: "2026-08-03T10:00:00Z", value: "new", extra: 2 },
    { id: "c", when: "not-a-date", updatedAt: "2026-08-03T11:00:00Z", value: "invalid" },
    { id: "z", when: "2026-08-01T08:00:00Z", updatedAt: "2026-08-01T09:00:00Z", value: "Z" },
    { id: "a", when: "2026-08-01T08:00:00Z", updatedAt: "2026-08-01T09:00:00Z", value: "A" },
  ];
  const snapshot = structuredClone(input);
  const result = normalizeEvents(input);

  assert.deepEqual(input, snapshot);
  assert.deepEqual(result, [
    { id: "a", when: "2026-08-01T08:00:00Z", value: "A" },
    { id: "z", when: "2026-08-01T08:00:00Z", value: "Z" },
    { id: "b", when: "2026-08-02T08:00:00Z", value: "new" },
  ]);
});
`,
      },
      testCommand: ["node", ["--test"]],
    },
  },
];

export function getBenchmarkDefinitions(): BenchmarkDefinition[] {
  return definitions;
}

export function getBenchmarkDefinition(id: string): BenchmarkDefinition | undefined {
  return definitions.find((definition) => definition.id === id);
}

export function getPublicBenchmarks(): BenchmarkCaseSummary[] {
  return definitions.map(({ id, title, category, description, kind, estimatedSeconds }) => ({
    id,
    title,
    category,
    description,
    kind,
    estimatedSeconds,
  }));
}

export function isWorkspaceKind(kind: BenchmarkKind): boolean {
  return kind === "workspace";
}
