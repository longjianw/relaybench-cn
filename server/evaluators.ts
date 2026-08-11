interface Evaluation {
  score: number;
  detail: string;
}

function stripMarkdownFence(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^```(?:json|text|txt)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : trimmed;
}

export function evaluateExactNumber(output: string, expected: number): Evaluation {
  const normalized = stripMarkdownFence(output).replace(/[,，\s]/g, "");
  const exact = normalized === String(expected);
  return {
    score: exact ? 100 : 0,
    detail: exact ? `结果正确：${expected}` : `期望仅返回 ${expected}`,
  };
}

export function evaluateExactText(output: string, expected: string): Evaluation {
  const normalized = stripMarkdownFence(output).replace(/\r\n/g, "\n").trim();
  const exact = normalized === expected.trim();
  if (exact) {
    return { score: 100, detail: "格式与内容完全符合要求" };
  }

  const expectedLines = expected.trim().split("\n");
  const actualLines = normalized.split("\n");
  const matchingLines = expectedLines.filter((line, index) => line === actualLines[index]).length;
  return {
    score: Math.round((matchingLines / expectedLines.length) * 70),
    detail: `正确匹配 ${matchingLines}/${expectedLines.length} 行，但存在额外内容或格式偏差`,
  };
}

export function evaluateStructuredJson(output: string): Evaluation {
  const normalized = stripMarkdownFence(output);
  try {
    const parsed = JSON.parse(normalized) as Record<string, unknown>;
    const valid =
      parsed.status === "ok" &&
      parsed.count === 3 &&
      Array.isArray(parsed.items) &&
      JSON.stringify(parsed.items) === JSON.stringify(["A", "B", "C"]);
    return {
      score: valid ? 100 : 30,
      detail: valid ? "JSON 可解析且字段完全正确" : "JSON 可解析，但字段或值不符合要求",
    };
  } catch {
    return { score: 0, detail: "输出不是有效 JSON" };
  }
}

export function evaluateContains(output: string, expected: string): Evaluation {
  const occurrences = output.split(expected).length - 1;
  return {
    score: occurrences === 1 ? 100 : occurrences > 1 ? 60 : 0,
    detail:
      occurrences === 1
        ? "准确找回目标信息"
        : occurrences > 1
          ? "包含目标信息，但重复输出"
          : "未找回目标信息",
  };
}

export function evaluateWorkspaceTest(exitCode: number, output: string): Evaluation {
  const passed = exitCode === 0;
  return {
    score: passed ? 100 : 0,
    detail: passed ? "隐藏验收测试全部通过" : `验收测试失败：${output.trim().slice(-240)}`,
  };
}
