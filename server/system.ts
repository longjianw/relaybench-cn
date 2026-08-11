import { access, readFile } from "node:fs/promises";
import { constants, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse } from "smol-toml";
import type { SystemInfo } from "../shared/types";

const bundledCodexPath = "/Applications/ChatGPT.app/Contents/Resources/codex";

export function resolveCodexPath(): string {
  if (process.env.CODEX_CLI_PATH) {
    return process.env.CODEX_CLI_PATH;
  }
  return existsSync(bundledCodexPath) ? bundledCodexPath : "codex";
}

export async function getSystemInfo(): Promise<SystemInfo> {
  const codexPath = resolveCodexPath();
  let codexAvailable = codexPath === "codex";

  if (codexPath !== "codex") {
    try {
      await access(codexPath, constants.X_OK);
      codexAvailable = true;
    } catch {
      codexAvailable = false;
    }
  }

  const info: SystemInfo = {
    codexAvailable,
    codexPath: codexAvailable ? codexPath : undefined,
  };

  try {
    const configPath = path.join(os.homedir(), ".codex", "config.toml");
    const raw = await readFile(configPath, "utf8");
    const config = parse(raw) as Record<string, unknown>;
    const providerId = typeof config.model_provider === "string" ? config.model_provider : "openai";
    const providers = config.model_providers as Record<string, Record<string, unknown>> | undefined;
    const provider = providers?.[providerId];
    info.currentProvider = {
      id: providerId,
      name: typeof provider?.name === "string" ? provider.name : undefined,
      model: typeof config.model === "string" ? config.model : undefined,
      baseUrl: typeof provider?.base_url === "string" ? provider.base_url : undefined,
    };
  } catch {
    // A missing or invalid user config should not prevent official Codex checks.
  }

  return info;
}
