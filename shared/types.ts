export type ProviderMode = "codex-official" | "codex-current" | "http-api";

export type ApiProtocol = "responses" | "chat-completions";

export interface ProviderConfig {
  id: string;
  label: string;
  mode: ProviderMode;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  protocol?: ApiProtocol;
}

export type BenchmarkKind = "response" | "workspace";

export interface BenchmarkCaseSummary {
  id: string;
  title: string;
  category: string;
  description: string;
  kind: BenchmarkKind;
  estimatedSeconds: number;
}

export interface UsageSummary {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface CaseAttemptResult {
  attempt: number;
  status: "passed" | "failed" | "error" | "skipped";
  score: number | null;
  latencyMs: number;
  output: string;
  detail: string;
  usage?: UsageSummary;
  returnedModel?: string;
  toolCalls?: number;
}

export interface CaseResult {
  caseId: string;
  title: string;
  category: string;
  status: "passed" | "failed" | "error" | "skipped";
  score: number | null;
  latencyMs: number;
  output: string;
  detail: string;
  usage?: UsageSummary;
  returnedModel?: string;
  toolCalls?: number;
  attempts?: CaseAttemptResult[];
  stabilityRate?: number;
  scoreSpread?: number;
}

export interface ProviderSummary {
  id: string;
  label: string;
  mode: ProviderMode;
  model?: string;
}

export interface ProviderRun {
  provider: ProviderSummary;
  results: CaseResult[];
  averageScore: number;
  passed: number;
  eligible: number;
  averageLatencyMs: number;
  totalTokens: number;
  stabilityRate: number;
}

export interface BenchmarkRun {
  id: string;
  startedAt: string;
  finishedAt: string;
  repeatCount: number;
  providers: ProviderRun[];
}

export interface SystemInfo {
  codexAvailable: boolean;
  codexPath?: string;
  currentProvider?: {
    id: string;
    name?: string;
    model?: string;
    baseUrl?: string;
  };
}
