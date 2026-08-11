import crypto from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { z } from "zod";
import type { BenchmarkRun } from "../shared/types";
import { getPublicBenchmarks } from "./benchmarks";
import { runProvider } from "./providers";
import { getSystemInfo } from "./system";

const app = express();
const port = Number(process.env.PORT ?? 8787);

app.disable("x-powered-by");
app.use(express.json({ limit: "256kb" }));

const providerSchema = z
  .object({
    id: z.string().min(1).max(80),
    label: z.string().min(1).max(80),
    mode: z.enum(["codex-official", "codex-current", "http-api"]),
    model: z.string().max(120).optional(),
    baseUrl: z.string().max(500).optional(),
    apiKey: z.string().max(500).optional(),
    protocol: z.enum(["responses", "chat-completions"]).optional(),
  })
  .superRefine((provider, context) => {
    if (provider.mode !== "http-api") return;
    if (!provider.baseUrl?.trim()) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["baseUrl"], message: "请输入 API 地址" });
    }
    if (!provider.model?.trim()) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["model"], message: "请输入模型名称" });
    }
  });

const benchmarkRequestSchema = z.object({
  providers: z.array(providerSchema).min(1).max(2),
  caseIds: z.array(z.string()).min(1).max(20),
  repeatCount: z.number().int().min(1).max(3).default(1),
});

app.get("/api/system", async (_request, response) => {
  response.json(await getSystemInfo());
});

app.get("/api/benchmarks", (_request, response) => {
  response.json(getPublicBenchmarks());
});

app.post("/api/benchmark", async (request, response) => {
  const parsed = benchmarkRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.issues[0]?.message ?? "请求参数错误" });
    return;
  }

  const startedAt = new Date();
  try {
    const providers = await Promise.all(
      parsed.data.providers.map((provider) =>
        runProvider(provider, parsed.data.caseIds, parsed.data.repeatCount),
      ),
    );
    const result: BenchmarkRun = {
      id: crypto.randomUUID(),
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      repeatCount: parsed.data.repeatCount,
      providers,
    };
    response.json(result);
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : "评测运行失败",
    });
  }
});

const currentFile = fileURLToPath(import.meta.url);
const distPath = path.resolve(path.dirname(currentFile), "../dist");
if (process.env.NODE_ENV === "production" && existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get("/{*splat}", (_request, response) => response.sendFile(path.join(distPath, "index.html")));
}

app.listen(port, "127.0.0.1", () => {
  console.log(`RelayBench API listening on http://127.0.0.1:${port}`);
});
