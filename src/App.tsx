import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Code2,
  Download,
  Eye,
  EyeOff,
  FileJson,
  FlaskConical,
  Gauge,
  Github,
  KeyRound,
  LoaderCircle,
  Play,
  RotateCcw,
  ShieldCheck,
  TerminalSquare,
  XCircle,
} from "lucide-react";
import type {
  ApiProtocol,
  BenchmarkCaseSummary,
  BenchmarkRun,
  CaseResult,
  ProviderConfig,
  ProviderMode,
  ProviderRun,
  SystemInfo,
} from "../shared/types";

const defaultProviders: ProviderConfig[] = [
  {
    id: "official",
    label: "官方 Codex",
    mode: "codex-official",
    model: "",
  },
  {
    id: "current",
    label: "当前 CC Switch 供应商",
    mode: "codex-current",
    model: "",
  },
];

const modeOptions: Array<{ value: ProviderMode; label: string }> = [
  { value: "codex-official", label: "本机官方 Codex 登录" },
  { value: "codex-current", label: "本机当前 Codex 配置" },
  { value: "http-api", label: "自定义 API" },
];

const feedbackUrl = "https://github.com/longjianw/relaybench-cn/issues/new/choose";

function formatDuration(ms: number): string {
  if (!ms) return "—";
  if (ms < 1_000) return `${ms} ms`;
  return `${(ms / 1_000).toFixed(1)} 秒`;
}

function resultTone(result: CaseResult): string {
  if (result.status === "passed") return "success";
  if (result.status === "failed") return "warning";
  if (result.status === "skipped") return "muted";
  return "danger";
}

function resultLabel(result: CaseResult): string {
  if (result.status === "passed") return "通过";
  if (result.status === "failed") return "未通过";
  if (result.status === "skipped") return "已跳过";
  return "错误";
}

function scoreComparison(run: BenchmarkRun): string {
  if (run.providers.length < 2) return "已完成单供应商评测。";
  const [left, right] = run.providers;
  if (!left.eligible || !right.eligible) return "有效样本不足，暂时无法比较。";
  const difference = left.averageScore - right.averageScore;
  if (Math.abs(difference) <= 5) return "两条线路在当前小样本中的质量表现接近。";
  const winner = difference > 0 ? left.provider.label : right.provider.label;
  return `${winner} 在当前小样本中领先 ${Math.abs(difference)} 分。`;
}

function attemptSummary(result: CaseResult): string {
  const attempts = result.attempts ?? [];
  if (attempts.length <= 1) return resultLabel(result);
  const eligible = attempts.filter((attempt) => attempt.status !== "skipped");
  const passed = eligible.filter((attempt) => attempt.status === "passed").length;
  return `${passed}/${eligible.length} 次通过`;
}

function createMarkdownReport(run: BenchmarkRun): string {
  const lines = [
    "# 模型验真台评测报告",
    "",
    `- 运行时间：${new Date(run.finishedAt).toLocaleString("zh-CN")}`,
    `- 每项运行：${run.repeatCount} 次`,
    `- 结论：${scoreComparison(run)}`,
    "- 说明：结果仅反映本次任务表现，不能作为模型身份的密码学证明。",
    "",
    "## 汇总",
    "",
    "| 供应商 | 平均得分 | 稳定通过 | 稳定率 | 平均耗时 | Token |",
    "|---|---:|---:|---:|---:|---:|",
  ];

  for (const provider of run.providers) {
    lines.push(
      `| ${provider.provider.label} | ${provider.averageScore} | ${provider.passed}/${provider.eligible} | ${provider.stabilityRate}% | ${formatDuration(provider.averageLatencyMs)} | ${provider.totalTokens || "—"} |`,
    );
  }

  for (const provider of run.providers) {
    lines.push("", `## ${provider.provider.label}`, "");
    lines.push("| 任务 | 通过次数 | 平均分 | 波动 | 平均耗时 | 说明 |", "|---|---:|---:|---:|---:|---|");
    for (const result of provider.results) {
      lines.push(
        `| ${result.title} | ${attemptSummary(result)} | ${result.score ?? "—"} | ${result.scoreSpread ?? 0} | ${formatDuration(result.latencyMs)} | ${result.detail.replace(/\|/g, "\\|")} |`,
      );
    }
    for (const result of provider.results) {
      if ((result.attempts?.length ?? 0) > 1) {
        lines.push("", `### ${result.title}逐次记录`, "");
        lines.push("| 次数 | 状态 | 得分 | 耗时 | Token |", "|---:|---|---:|---:|---:|");
        for (const attempt of result.attempts ?? []) {
          lines.push(
            `| ${attempt.attempt} | ${attempt.status === "passed" ? "通过" : attempt.status === "failed" ? "未通过" : attempt.status === "skipped" ? "跳过" : "错误"} | ${attempt.score ?? "—"} | ${formatDuration(attempt.latencyMs)} | ${attempt.usage?.totalTokens ?? "—"} |`,
          );
        }
      }
    }
  }

  return lines.join("\n");
}

function downloadText(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

interface ProviderEditorProps {
  provider: ProviderConfig;
  index: number;
  systemInfo: SystemInfo | null;
  onChange: (next: ProviderConfig) => void;
}

function ProviderEditor({ provider, index, systemInfo, onChange }: ProviderEditorProps) {
  const [showKey, setShowKey] = useState(false);
  const update = <K extends keyof ProviderConfig>(key: K, value: ProviderConfig[K]) => {
    onChange({ ...provider, [key]: value });
  };

  return (
    <section className="provider-card" aria-label={`供应商 ${index + 1}`}>
      <div className="provider-heading">
        <span className={`provider-marker provider-marker-${index + 1}`}>{index + 1}</span>
        <div>
          <h3>{provider.label || `供应商 ${index + 1}`}</h3>
          <p>{index === 0 ? "对照基准" : "待测线路"}</p>
        </div>
      </div>

      <label className="field">
        <span>显示名称</span>
        <input value={provider.label} onChange={(event) => update("label", event.target.value)} />
      </label>

      <label className="field">
        <span>接入方式</span>
        <select
          value={provider.mode}
          onChange={(event) => update("mode", event.target.value as ProviderMode)}
        >
          {modeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {provider.mode === "codex-official" && (
        <div className="source-note">
          <ShieldCheck size={17} />
          <span>使用本机 OpenAI 登录，并忽略当前 CC Switch 供应商配置。</span>
        </div>
      )}

      {provider.mode === "codex-current" && (
        <div className="source-note">
          <TerminalSquare size={17} />
          <span>
            当前为 {systemInfo?.currentProvider?.name || systemInfo?.currentProvider?.id || "本机配置"}
            {systemInfo?.currentProvider?.model ? ` · ${systemInfo.currentProvider.model}` : ""}
          </span>
        </div>
      )}

      <label className="field">
        <span>{provider.mode === "http-api" ? "模型 ID" : "指定模型（可选）"}</span>
        <input
          value={provider.model ?? ""}
          placeholder={provider.mode === "http-api" ? "例如 gpt-5.4" : "留空使用默认模型"}
          onChange={(event) => update("model", event.target.value)}
        />
      </label>

      {provider.mode === "http-api" && (
        <>
          <label className="field">
            <span>API Base URL</span>
            <input
              value={provider.baseUrl ?? ""}
              placeholder="https://api.example.com/v1"
              onChange={(event) => update("baseUrl", event.target.value)}
            />
          </label>

          <label className="field">
            <span>API Key</span>
            <div className="secret-input">
              <KeyRound size={16} />
              <input
                type={showKey ? "text" : "password"}
                value={provider.apiKey ?? ""}
                autoComplete="off"
                placeholder="仅用于本次运行"
                onChange={(event) => update("apiKey", event.target.value)}
              />
              <button
                type="button"
                className="icon-button"
                onClick={() => setShowKey((value) => !value)}
                title={showKey ? "隐藏 Key" : "显示 Key"}
              >
                {showKey ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </label>

          <div className="field">
            <span>API 协议</span>
            <div className="segmented-control" role="group" aria-label="API 协议">
              {(["responses", "chat-completions"] as ApiProtocol[]).map((protocol) => (
                <button
                  type="button"
                  key={protocol}
                  className={(provider.protocol ?? "responses") === protocol ? "active" : ""}
                  onClick={() => update("protocol", protocol)}
                >
                  {protocol === "responses" ? "Responses" : "Chat Completions"}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function SummaryCard({ provider }: { provider: ProviderRun }) {
  return (
    <article className="summary-card">
      <div className="summary-title">
        <span>{provider.provider.label}</span>
        <strong>{provider.averageScore}</strong>
      </div>
      <div className="score-track" aria-label={`平均得分 ${provider.averageScore}`}>
        <span style={{ width: `${provider.averageScore}%` }} />
      </div>
      <div className="summary-metrics">
        <span>
          <CheckCircle2 size={16} /> {provider.passed}/{provider.eligible} 通过
        </span>
        <span>
          <ShieldCheck size={16} /> {provider.stabilityRate}% 稳定率
        </span>
        <span>
          <Clock3 size={16} /> {formatDuration(provider.averageLatencyMs)}
        </span>
        <span>
          <Gauge size={16} /> {provider.totalTokens || "—"} Token
        </span>
      </div>
    </article>
  );
}

function ResultCell({ result }: { result: CaseResult | undefined }) {
  if (!result) return <span className="muted-text">—</span>;
  return (
    <div className="result-cell">
      <span className={`status-badge ${resultTone(result)}`}>
        {result.status === "passed" && <CheckCircle2 size={14} />}
        {result.status === "error" && <XCircle size={14} />}
        {result.status === "failed" && <AlertTriangle size={14} />}
        {attemptSummary(result)}
      </span>
      <strong>{result.score ?? "—"}</strong>
      <small>
        {formatDuration(result.latencyMs)}
        {(result.attempts?.length ?? 0) > 1 ? ` · 波动 ${result.scoreSpread ?? 0}` : ""}
      </small>
    </div>
  );
}

export default function App() {
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [benchmarks, setBenchmarks] = useState<BenchmarkCaseSummary[]>([]);
  const [providers, setProviders] = useState<ProviderConfig[]>(defaultProviders);
  const [selectedCases, setSelectedCases] = useState<string[]>([]);
  const [repeatCount, setRepeatCount] = useState<1 | 3>(1);
  const [run, setRun] = useState<BenchmarkRun | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/system").then((response) => response.json() as Promise<SystemInfo>),
      fetch("/api/benchmarks").then((response) => response.json() as Promise<BenchmarkCaseSummary[]>),
    ])
      .then(([nextSystemInfo, nextBenchmarks]) => {
        setSystemInfo(nextSystemInfo);
        setBenchmarks(nextBenchmarks);
        setSelectedCases(
          nextBenchmarks.filter((benchmark) => benchmark.kind === "response").map((benchmark) => benchmark.id),
        );
        if (nextSystemInfo.currentProvider?.name) {
          setProviders((current) => [
            current[0],
            { ...current[1], label: nextSystemInfo.currentProvider?.name ?? current[1].label },
          ]);
        }
      })
      .catch(() => setError("无法读取本机评测环境"));
  }, []);

  const estimatedSeconds = useMemo(
    () => {
      const selected = benchmarks.filter((benchmark) => selectedCases.includes(benchmark.id));
      const responseEstimate = Math.max(
        0,
        ...selected.filter((benchmark) => benchmark.kind === "response").map((benchmark) => benchmark.estimatedSeconds),
      );
      const workspaceEstimate = selected
        .filter((benchmark) => benchmark.kind === "workspace")
        .reduce((total, benchmark) => total + benchmark.estimatedSeconds, 0);
      return (responseEstimate + workspaceEstimate) * repeatCount;
    },
    [benchmarks, repeatCount, selectedCases],
  );
  const selectedProvidersNeedCodex = providers.some((provider) => provider.mode !== "http-api");
  const environmentReady = !selectedProvidersNeedCodex || Boolean(systemInfo?.codexAvailable);

  const updateProvider = (index: number, provider: ProviderConfig) => {
    setProviders((current) => current.map((item, itemIndex) => (itemIndex === index ? provider : item)));
  };

  const toggleCase = (id: string) => {
    setSelectedCases((current) =>
      current.includes(id) ? current.filter((caseId) => caseId !== id) : [...current, id],
    );
  };

  const runBenchmark = async () => {
    setError("");
    setRunning(true);
    setRun(null);
    try {
      const response = await fetch("/api/benchmark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providers, caseIds: selectedCases, repeatCount }),
      });
      const payload = (await response.json()) as BenchmarkRun | { error: string };
      if (!response.ok) throw new Error("error" in payload ? payload.error : "评测启动失败");
      setRun(payload as BenchmarkRun);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "评测运行失败");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-icon"><FlaskConical size={22} /></div>
          <div>
            <h1>模型验真台</h1>
            <p>RelayBench CN</p>
          </div>
        </div>
        <div className="topbar-actions">
          <div className="environment-status">
            <span className={systemInfo?.codexAvailable ? "status-dot online" : "status-dot"} />
            {systemInfo?.codexAvailable ? "本机 Codex 已连接" : "等待 Codex 环境"}
          </div>
          <a
            className="feedback-link"
            href={feedbackUrl}
            target="_blank"
            rel="noreferrer"
            title="在 GitHub 提交问题或建议"
          >
            <Github size={17} />
            <span>反馈问题</span>
          </a>
        </div>
      </header>

      <main>
        <section className="page-heading">
          <div>
            <span className="eyebrow">供应商对比评测</span>
            <h2>同一组任务，同时测试两条线路</h2>
          </div>
          <div className="privacy-note">
            <ShieldCheck size={18} />
            <span>密钥不写入磁盘或报告</span>
          </div>
        </section>

        <div className="provider-grid">
          {providers.map((provider, index) => (
            <ProviderEditor
              key={provider.id}
              provider={provider}
              index={index}
              systemInfo={systemInfo}
              onChange={(next) => updateProvider(index, next)}
            />
          ))}
        </div>

        <section className="benchmark-section">
          <div className="section-heading">
            <div>
              <span className="section-icon"><Code2 size={18} /></span>
              <div>
                <h2>评测任务</h2>
                <p>选择本次需要运行的客观测试。</p>
              </div>
            </div>
            <button
              type="button"
              className="text-button"
              onClick={() =>
                setSelectedCases(selectedCases.length === benchmarks.length ? [] : benchmarks.map((item) => item.id))
              }
            >
              {selectedCases.length === benchmarks.length ? "全部取消" : "全部选择"}
            </button>
          </div>

          <div className="benchmark-list">
            {benchmarks.map((benchmark) => (
              <label className="benchmark-row" key={benchmark.id}>
                <input
                  type="checkbox"
                  checked={selectedCases.includes(benchmark.id)}
                  onChange={() => toggleCase(benchmark.id)}
                />
                <span className="benchmark-check" />
                <span className="benchmark-main">
                  <strong>{benchmark.title}</strong>
                  <small>{benchmark.description}</small>
                </span>
                <span className="category-tag">{benchmark.category}</span>
                <span className="benchmark-time">约 {benchmark.estimatedSeconds} 秒</span>
              </label>
            ))}
          </div>

          <div className="run-bar">
            <div className="run-summary">
              <strong>{selectedCases.length} 个任务 · 每项 {repeatCount} 次</strong>
              <span>响应题合并调用；预计单线路约 {estimatedSeconds} 秒，两条线路并行运行</span>
            </div>
            <div className="repeat-picker">
              <span>重复次数</span>
              <div className="segmented-control" role="group" aria-label="重复次数">
                {([1, 3] as const).map((count) => (
                  <button
                    type="button"
                    key={count}
                    className={repeatCount === count ? "active" : ""}
                    disabled={running}
                    onClick={() => setRepeatCount(count)}
                  >
                    {count} 次
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              className="primary-button"
              disabled={running || !selectedCases.length || !environmentReady}
              onClick={runBenchmark}
            >
              {running ? <LoaderCircle className="spin" size={18} /> : <Play size={18} fill="currentColor" />}
              {running ? "评测运行中" : "开始并行评测"}
            </button>
          </div>
        </section>

        {error && (
          <div className="error-banner" role="alert">
            <AlertTriangle size={18} />
            <span>{error}</span>
          </div>
        )}

        {run && (
          <section className="results-section">
            <div className="section-heading results-heading">
              <div>
                <span className="section-icon"><Gauge size={18} /></span>
                <div>
                  <h2>本次结果</h2>
                  <p>{scoreComparison(run)} 每项已运行 {run.repeatCount} 次。</p>
                </div>
              </div>
              <div className="report-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => downloadText(`relaybench-${run.id}.json`, JSON.stringify(run, null, 2), "application/json")}
                >
                  <FileJson size={17} /> JSON
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => downloadText(`relaybench-${run.id}.md`, createMarkdownReport(run), "text/markdown")}
                >
                  <Download size={17} /> 报告
                </button>
              </div>
            </div>

            <div className="summary-grid">
              {run.providers.map((provider) => (
                <SummaryCard provider={provider} key={provider.provider.id} />
              ))}
            </div>

            <div className="result-table-wrap">
              <table className="result-table">
                <thead>
                  <tr>
                    <th>评测任务</th>
                    {run.providers.map((provider) => (
                      <th key={provider.provider.id}>{provider.provider.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {benchmarks
                    .filter((benchmark) => selectedCases.includes(benchmark.id))
                    .map((benchmark) => (
                      <tr key={benchmark.id}>
                        <td>
                          <strong>{benchmark.title}</strong>
                          <small>{benchmark.category}</small>
                        </td>
                        {run.providers.map((provider) => (
                          <td key={provider.provider.id}>
                            <ResultCell result={provider.results.find((result) => result.caseId === benchmark.id)} />
                          </td>
                        ))}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            <div className="details-list">
              {run.providers.map((provider) => (
                <details key={provider.provider.id}>
                  <summary>
                    <span>{provider.provider.label} 详细记录</span>
                    <ChevronDown size={17} />
                  </summary>
                  <div className="detail-content">
                    {provider.results.map((result) => (
                      <article key={result.caseId}>
                        <div>
                          <strong>{result.title}</strong>
                          <span className={`status-badge ${resultTone(result)}`}>{attemptSummary(result)}</span>
                        </div>
                        <p>{result.detail}</p>
                        {(result.attempts?.length ?? 0) > 1 ? (
                          <div className="attempt-list">
                            {result.attempts?.map((attempt) => (
                              <section className="attempt-row" key={attempt.attempt}>
                                <div>
                                  <strong>第 {attempt.attempt} 次</strong>
                                  <span>{attempt.score ?? "—"} 分</span>
                                  <span>{formatDuration(attempt.latencyMs)}</span>
                                  <span>{attempt.usage?.totalTokens ?? "—"} Token</span>
                                </div>
                                <p>{attempt.detail}</p>
                                {attempt.output && <pre>{attempt.output}</pre>}
                              </section>
                            ))}
                          </div>
                        ) : result.output ? (
                          <pre>{result.output}</pre>
                        ) : null}
                      </article>
                    ))}
                  </div>
                </details>
              ))}
            </div>

            <div className="disclaimer">
              <AlertTriangle size={17} />
              <span>小样本结果用于发现质量差异和异常信号，不代表模型身份认证或长期稳定性保证。</span>
            </div>
          </section>
        )}

        {!run && !running && (
          <section className="empty-report">
            <RotateCcw size={22} />
            <div>
              <strong>报告将在评测完成后生成</strong>
              <span>不会保存 API Key，也不会修改你的 CC Switch 配置。</span>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
