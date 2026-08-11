import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  ApiProtocol,
  CaseAttemptResult,
  CaseResult,
  ProviderConfig,
  ProviderRun,
  UsageSummary,
} from "../shared/types";
import { getBenchmarkDefinition, type BenchmarkDefinition } from "./benchmarks";
import { evaluateWorkspaceTest } from "./evaluators";
import { resolveCodexPath } from "./system";

interface ModelResponse {
  text: string;
  latencyMs: number;
  usage?: UsageSummary;
  returnedModel?: string;
  toolCalls?: number;
}

interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

const maxCapturedOutput = 2_000_000;

function sanitizeText(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer <redacted>")
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, "sk-<redacted>");
}

function appendCaptured(current: string, chunk: Buffer | string): string {
  const next = current + chunk.toString();
  return next.length > maxCapturedOutput ? next.slice(-maxCapturedOutput) : next;
}

function runProcess(
  command: string,
  args: string[],
  options: { cwd: string; timeoutMs: number },
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2_000).unref();
    }, options.timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout = appendCaptured(stdout, chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr = appendCaptured(stderr, chunk);
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });
  });
}

function parseCodexJsonl(stdout: string): Omit<ModelResponse, "latencyMs"> {
  let text = "";
  let usage: UsageSummary | undefined;
  let returnedModel: string | undefined;
  let toolCalls = 0;

  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const event = JSON.parse(trimmed) as Record<string, any>;
      const item = event.item as Record<string, any> | undefined;

      if (event.type === "item.completed" && item?.type === "agent_message") {
        text = String(item.text ?? item.content ?? text);
      }
      if (
        (event.type === "item.started" || event.type === "item.completed") &&
        ["command_execution", "mcp_tool_call", "web_search", "file_change"].includes(String(item?.type))
      ) {
        toolCalls += event.type === "item.started" ? 1 : 0;
      }
      if (event.type === "turn.completed" && event.usage) {
        const inputTokens = Number(event.usage.input_tokens ?? 0);
        const outputTokens = Number(event.usage.output_tokens ?? 0);
        usage = {
          inputTokens,
          outputTokens,
          totalTokens: Number(event.usage.total_tokens ?? inputTokens + outputTokens),
        };
      }
      if (typeof event.model === "string") returnedModel = event.model;
      if (typeof item?.model === "string") returnedModel = item.model;
    } catch {
      // Ignore non-event lines; stderr is returned separately on failure.
    }
  }

  return { text: text.trim(), usage, returnedModel, toolCalls };
}

async function runCodex(
  provider: ProviderConfig,
  prompt: string,
  cwd: string,
  workspaceWrite: boolean,
): Promise<ModelResponse> {
  const args = [
    "exec",
    "--json",
    "--ephemeral",
    "--skip-git-repo-check",
    "--color",
    "never",
    "-s",
    workspaceWrite ? "workspace-write" : "read-only",
    "-C",
    cwd,
  ];

  if (provider.mode === "codex-official") {
    args.push("--ignore-user-config");
  }
  if (provider.model?.trim()) {
    args.push("--model", provider.model.trim());
  }
  args.push(prompt);

  const started = performance.now();
  const result = await runProcess(resolveCodexPath(), args, {
    cwd,
    timeoutMs: workspaceWrite ? 240_000 : 150_000,
  });
  const latencyMs = Math.round(performance.now() - started);
  const parsed = parseCodexJsonl(result.stdout);

  if (result.exitCode !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || "Codex 执行失败";
    throw new Error(sanitizeText(detail.slice(-900)));
  }
  if (!parsed.text && !workspaceWrite) {
    throw new Error("Codex 未返回可评分的最终文本");
  }

  return { ...parsed, latencyMs };
}

function endpointFor(baseUrl: string, protocol: ApiProtocol): string {
  const normalized = baseUrl.trim().replace(/\/+$/, "");
  if (protocol === "responses") {
    return normalized.endsWith("/responses") ? normalized : `${normalized}/responses`;
  }
  return normalized.endsWith("/chat/completions") ? normalized : `${normalized}/chat/completions`;
}

function extractResponseText(data: Record<string, any>, protocol: ApiProtocol): string {
  if (protocol === "chat-completions") {
    const content = data.choices?.[0]?.message?.content;
    if (typeof content === "string") return content.trim();
    if (Array.isArray(content)) {
      return content.map((part) => part?.text ?? "").join("").trim();
    }
    return "";
  }

  if (typeof data.output_text === "string") return data.output_text.trim();
  const parts: string[] = [];
  for (const item of data.output ?? []) {
    if (item?.type !== "message") continue;
    for (const content of item.content ?? []) {
      if (content?.type === "output_text" && typeof content.text === "string") {
        parts.push(content.text);
      }
    }
  }
  return parts.join("\n").trim();
}

async function runHttpApi(provider: ProviderConfig, prompt: string, maxOutputTokens: number): Promise<ModelResponse> {
  const protocol = provider.protocol ?? "responses";
  const endpoint = endpointFor(provider.baseUrl ?? "", protocol);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (provider.apiKey?.trim()) headers.Authorization = `Bearer ${provider.apiKey.trim()}`;

  const body =
    protocol === "responses"
      ? {
          model: provider.model,
          input: prompt,
          max_output_tokens: maxOutputTokens,
          store: false,
        }
      : {
          model: provider.model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: maxOutputTokens,
        };

  const started = performance.now();
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const raw = await response.text();
    let data: Record<string, any>;
    try {
      data = JSON.parse(raw) as Record<string, any>;
    } catch {
      throw new Error(`接口返回非 JSON 内容：${sanitizeText(raw.slice(0, 300))}`);
    }
    if (!response.ok) {
      const message = data.error?.message ?? data.message ?? raw;
      throw new Error(`HTTP ${response.status}：${sanitizeText(String(message).slice(0, 600))}`);
    }

    const usageSource = data.usage ?? {};
    const inputTokens = Number(usageSource.input_tokens ?? usageSource.prompt_tokens ?? 0);
    const outputTokens = Number(usageSource.output_tokens ?? usageSource.completion_tokens ?? 0);
    return {
      text: extractResponseText(data, protocol),
      latencyMs: Math.round(performance.now() - started),
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: Number(usageSource.total_tokens ?? inputTokens + outputTokens),
      },
      returnedModel: typeof data.model === "string" ? data.model : undefined,
      toolCalls: 0,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function writeWorkspace(root: string, files: Record<string, string>): Promise<void> {
  for (const [relativePath, content] of Object.entries(files)) {
    const target = path.join(root, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
  }
}

async function runCase(provider: ProviderConfig, caseId: string): Promise<CaseResult> {
  const definition = getBenchmarkDefinition(caseId);
  if (!definition) {
    return {
      caseId,
      title: caseId,
      category: "未知",
      status: "error",
      score: null,
      latencyMs: 0,
      output: "",
      detail: "未找到评测任务",
    };
  }

  if (definition.kind === "workspace" && provider.mode === "http-api") {
    return {
      caseId,
      title: definition.title,
      category: definition.category,
      status: "skipped",
      score: null,
      latencyMs: 0,
      output: "",
      detail: "普通 HTTP API 暂不支持代码仓库修改任务",
    };
  }

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "relaybench-"));
  try {
    if (definition.workspace) {
      await writeWorkspace(tempRoot, definition.workspace.files);
    }

    const response =
      provider.mode === "http-api"
        ? await runHttpApi(provider, definition.prompt, definition.maxOutputTokens)
        : await runCodex(
            provider,
            definition.workspace?.instruction ?? definition.prompt,
            tempRoot,
            definition.kind === "workspace",
          );

    let evaluation = definition.evaluate?.(response.text) ?? { score: 0, detail: "缺少评分器" };
    let testOutput = "";

    if (definition.workspace) {
      if (definition.workspace.hiddenFiles) {
        await writeWorkspace(tempRoot, definition.workspace.hiddenFiles);
      }
      const [command, args] = definition.workspace.testCommand;
      const testResult = await runProcess(command, args, { cwd: tempRoot, timeoutMs: 30_000 });
      testOutput = `${testResult.stdout}\n${testResult.stderr}`.trim();
      evaluation = evaluateWorkspaceTest(testResult.exitCode, testOutput);
    }

    return {
      caseId,
      title: definition.title,
      category: definition.category,
      status: evaluation.score >= 80 ? "passed" : "failed",
      score: evaluation.score,
      latencyMs: response.latencyMs,
      output: definition.workspace ? testOutput.slice(-1_200) : response.text.slice(0, 2_000),
      detail: evaluation.detail,
      usage: response.usage,
      returnedModel: response.returnedModel,
      toolCalls: response.toolCalls,
    };
  } catch (error) {
    return {
      caseId,
      title: definition.title,
      category: definition.category,
      status: "error",
      score: null,
      latencyMs: 0,
      output: "",
      detail: error instanceof Error ? sanitizeText(error.message) : "未知执行错误",
    };
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

function extractJsonObject(output: string): Record<string, unknown> {
  const withoutFence = output
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("批量评测未返回 JSON 对象");
  return JSON.parse(withoutFence.slice(start, end + 1)) as Record<string, unknown>;
}

function distributeMetric(total: number | undefined, index: number, count: number): number | undefined {
  if (total === undefined) return undefined;
  const base = Math.floor(total / count);
  return base + (index < total % count ? 1 : 0);
}

async function runResponseBatch(
  provider: ProviderConfig,
  definitions: BenchmarkDefinition[],
): Promise<CaseResult[]> {
  if (!definitions.length) return [];
  const batchPrompt = [
    "你正在执行一组互相独立的客观评测。",
    "只返回一个合法 JSON 对象，不要代码块或解释。",
    "对象的 key 必须是任务 ID，value 必须是该任务要求的最终答案；换行用 JSON 字符串中的 \\n 表示。",
    "",
    ...definitions.flatMap((definition, index) => [
      `任务 ${index + 1}，ID=${definition.id}`,
      definition.prompt,
      "",
    ]),
  ].join("\n");

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "relaybench-batch-"));
  try {
    const maxOutputTokens = Math.min(
      2_048,
      Math.max(512, definitions.reduce((total, definition) => total + definition.maxOutputTokens, 0)),
    );
    const response =
      provider.mode === "http-api"
        ? await runHttpApi(provider, batchPrompt, maxOutputTokens)
        : await runCodex(provider, batchPrompt, tempRoot, false);
    const payload = extractJsonObject(response.text);

    return definitions.map((definition, index) => {
      const rawAnswer = payload[definition.id];
      const answer =
        typeof rawAnswer === "string"
          ? rawAnswer
          : rawAnswer === undefined
            ? ""
            : JSON.stringify(rawAnswer);
      const evaluation = definition.evaluate?.(answer) ?? { score: 0, detail: "缺少评分器" };
      const count = definitions.length;
      return {
        caseId: definition.id,
        title: definition.title,
        category: definition.category,
        status: evaluation.score >= 80 ? "passed" : "failed",
        score: evaluation.score,
        latencyMs: distributeMetric(response.latencyMs, index, count) ?? 0,
        output: answer.slice(0, 2_000),
        detail: `${evaluation.detail} · 本题与其他响应题合并运行`,
        usage: response.usage
          ? {
              inputTokens: distributeMetric(response.usage.inputTokens, index, count),
              outputTokens: distributeMetric(response.usage.outputTokens, index, count),
              totalTokens: distributeMetric(response.usage.totalTokens, index, count),
            }
          : undefined,
        returnedModel: response.returnedModel,
        toolCalls: index === 0 ? response.toolCalls : 0,
      };
    });
  } catch (error) {
    const detail = error instanceof Error ? sanitizeText(error.message) : "批量评测失败";
    return definitions.map((definition) => ({
      caseId: definition.id,
      title: definition.title,
      category: definition.category,
      status: "error",
      score: null,
      latencyMs: 0,
      output: "",
      detail,
    }));
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

export function summarizeProvider(provider: ProviderConfig, results: CaseResult[]): ProviderRun {
  const scored = results.filter((result) => typeof result.score === "number");
  const completed = results.filter((result) => result.status !== "skipped");
  const totalTokens = results.reduce((total, result) => total + (result.usage?.totalTokens ?? 0), 0);
  const attemptResults = results.flatMap((result) => result.attempts ?? []);
  const eligibleAttempts = attemptResults.filter((result) => result.status !== "skipped");
  const passedAttempts = eligibleAttempts.filter((result) => result.status === "passed");
  return {
    provider: {
      id: provider.id,
      label: provider.label,
      mode: provider.mode,
      model: provider.model,
    },
    results,
    averageScore: scored.length
      ? Math.round(scored.reduce((total, result) => total + (result.score ?? 0), 0) / scored.length)
      : 0,
    passed: scored.filter((result) => result.status === "passed").length,
    eligible: scored.length,
    averageLatencyMs: completed.length
      ? Math.round(completed.reduce((total, result) => total + result.latencyMs, 0) / completed.length)
      : 0,
    totalTokens,
    stabilityRate: eligibleAttempts.length
      ? Math.round((passedAttempts.length / eligibleAttempts.length) * 100)
      : 0,
  };
}

function toAttempt(result: CaseResult, attempt: number): CaseAttemptResult {
  return {
    attempt,
    status: result.status,
    score: result.score,
    latencyMs: result.latencyMs,
    output: result.output,
    detail: result.detail,
    usage: result.usage,
    returnedModel: result.returnedModel,
    toolCalls: result.toolCalls,
  };
}

export function aggregateCaseAttempts(
  caseId: string,
  attempts: CaseAttemptResult[],
  fallbackDefinition?: BenchmarkDefinition,
): CaseResult {
  const scored = attempts.filter((attempt) => typeof attempt.score === "number");
  const eligible = attempts.filter((attempt) => attempt.status !== "skipped");
  const passed = eligible.filter((attempt) => attempt.status === "passed");
  const scores = scored.map((attempt) => attempt.score ?? 0);
  const totalUsage = attempts.reduce(
    (usage, attempt) => ({
      inputTokens: (usage.inputTokens ?? 0) + (attempt.usage?.inputTokens ?? 0),
      outputTokens: (usage.outputTokens ?? 0) + (attempt.usage?.outputTokens ?? 0),
      totalTokens: (usage.totalTokens ?? 0) + (attempt.usage?.totalTokens ?? 0),
    }),
    {} as UsageSummary,
  );
  const status: CaseResult["status"] =
    attempts.every((attempt) => attempt.status === "skipped")
      ? "skipped"
      : attempts.every((attempt) => attempt.status === "error")
        ? "error"
        : passed.length === eligible.length
          ? "passed"
          : "failed";
  const averageScore = scores.length
    ? Math.round(scores.reduce((total, score) => total + score, 0) / scores.length)
    : null;
  const scoreSpread = scores.length ? Math.max(...scores) - Math.min(...scores) : 0;
  const stabilityRate = eligible.length ? Math.round((passed.length / eligible.length) * 100) : 0;
  const latest = [...attempts].reverse().find((attempt) => attempt.output || attempt.detail) ?? attempts[0];

  return {
    caseId,
    title: fallbackDefinition?.title ?? caseId,
    category: fallbackDefinition?.category ?? "未知",
    status,
    score: averageScore,
    latencyMs: eligible.length
      ? Math.round(eligible.reduce((total, attempt) => total + attempt.latencyMs, 0) / eligible.length)
      : 0,
    output: latest?.output ?? "",
    detail:
      attempts.length > 1
        ? `${attempts.length} 次运行中 ${passed.length} 次通过，平均 ${averageScore ?? "—"} 分，得分波动 ${scoreSpread} 分`
        : latest?.detail ?? "",
    usage: totalUsage,
    returnedModel: latest?.returnedModel,
    toolCalls: attempts.reduce((total, attempt) => total + (attempt.toolCalls ?? 0), 0),
    attempts,
    stabilityRate,
    scoreSpread,
  };
}

export async function runProvider(
  provider: ProviderConfig,
  caseIds: string[],
  repeatCount = 1,
): Promise<ProviderRun> {
  const definitions = caseIds
    .map((caseId) => getBenchmarkDefinition(caseId))
    .filter((definition): definition is BenchmarkDefinition => Boolean(definition));
  const responseDefinitions = definitions.filter((definition) => definition.kind === "response");
  const attemptMap = new Map<string, CaseAttemptResult[]>();

  for (let attempt = 1; attempt <= repeatCount; attempt += 1) {
    for (const result of await runResponseBatch(provider, responseDefinitions)) {
      const attempts = attemptMap.get(result.caseId) ?? [];
      attempts.push(toAttempt(result, attempt));
      attemptMap.set(result.caseId, attempts);
    }
    for (const definition of definitions.filter((item) => item.kind === "workspace")) {
      const result = await runCase(provider, definition.id);
      const attempts = attemptMap.get(result.caseId) ?? [];
      attempts.push(toAttempt(result, attempt));
      attemptMap.set(result.caseId, attempts);
    }
  }

  const resultMap = new Map<string, CaseResult>();
  for (const definition of definitions) {
    resultMap.set(
      definition.id,
      aggregateCaseAttempts(definition.id, attemptMap.get(definition.id) ?? [], definition),
    );
  }
  const results = caseIds
    .map((caseId) => resultMap.get(caseId))
    .filter((result): result is CaseResult => Boolean(result));
  return summarizeProvider(provider, results);
}
