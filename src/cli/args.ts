import { parseArgs } from "node:util";
import type { ApiType } from "../types.js";
import { DEFAULT_PROBE_CONCURRENCY, MAX_PROBE_CONCURRENCY, PROBE_RETRIES, PROBE_TIMEOUT_MS } from "../services/probe-service.js";

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

export type CliCommand = "interactive" | "probe" | "list" | "help" | "version";

export interface GlobalOptions {
  noColor: boolean;
  quiet: boolean;
}

export interface ConnectionOptions {
  /** Saved connection name, if provided. */
  configName?: string;
  apiType?: ApiType;
  baseUrl?: string;
  /**
   * Resolved API key. Empty string means no key.
   * `fromFlag` is true when the user passed --api-key explicitly (including empty).
   */
  apiKey: string;
  apiKeyFromFlag: boolean;
}

export interface ModelSelectionOptions {
  all: boolean;
  models?: string[];
  filter?: string;
  exclude?: string;
  useSavedModels: boolean;
  strict: boolean;
}

export interface ProbeBehaviorOptions {
  concurrency: number;
  timeoutMs: number;
  retries: number;
}

export interface OutputOptions {
  json: boolean;
  outputPath?: string;
}

export type ParsedCli =
  | { command: "interactive"; global: GlobalOptions }
  | { command: "help"; global: GlobalOptions }
  | { command: "version"; global: GlobalOptions }
  | {
      command: "probe";
      global: GlobalOptions;
      connection: ConnectionOptions;
      selection: ModelSelectionOptions;
      behavior: ProbeBehaviorOptions;
      output: OutputOptions;
    }
  | {
      command: "list";
      global: GlobalOptions;
      connection: ConnectionOptions;
      filter?: string;
      exclude?: string;
      output: OutputOptions;
    };

const COMMANDS = new Set(["probe", "list", "help", "version"]);

interface CliArgValues {
  help?: boolean;
  version?: boolean;
  "no-color"?: boolean;
  quiet?: boolean;
  config?: string;
  type?: string;
  "base-url"?: string;
  "api-key"?: string;
  all?: boolean;
  models?: string;
  filter?: string;
  exclude?: string;
  "use-saved-models"?: boolean;
  strict?: boolean;
  concurrency?: string;
  timeout?: string;
  retries?: string;
  json?: boolean;
  output?: string;
}

export function parseCliArgs(argv: string[] = process.argv.slice(2), env: NodeJS.ProcessEnv = process.env): ParsedCli {
  let values: CliArgValues;
  let positionals: string[];

  try {
    const parsed = parseArgs({
      args: argv,
      options: {
        help: { type: "boolean", short: "h", default: false },
        version: { type: "boolean", short: "V", default: false },
        "no-color": { type: "boolean", default: false },
        quiet: { type: "boolean", short: "q", default: false },
        config: { type: "string" },
        type: { type: "string" },
        "base-url": { type: "string" },
        "api-key": { type: "string" },
        all: { type: "boolean", default: false },
        models: { type: "string" },
        filter: { type: "string" },
        exclude: { type: "string" },
        "use-saved-models": { type: "boolean", default: false },
        strict: { type: "boolean", default: false },
        concurrency: { type: "string" },
        timeout: { type: "string" },
        retries: { type: "string" },
        json: { type: "boolean", default: false },
        output: { type: "string", short: "o" },
      },
      allowPositionals: true,
      strict: true,
    });
    values = parsed.values as CliArgValues;
    positionals = parsed.positionals;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new UsageError(message);
  }

  const global: GlobalOptions = {
    noColor: Boolean(values["no-color"]) || env.NO_COLOR !== undefined,
    quiet: Boolean(values.quiet),
  };

  if (values.help) {
    return { command: "help", global };
  }
  if (values.version) {
    return { command: "version", global };
  }

  const commandToken = positionals[0];
  if (positionals.length > 1) {
    throw new UsageError(`多余的参数：${positionals.slice(1).join(" ")}`);
  }

  if (!commandToken) {
    if (hasNonInteractiveHints(values)) {
      throw new UsageError("检测到探测相关参数，但未指定子命令。请使用 `modelprobe probe ...` 或 `modelprobe list ...`。");
    }
    return { command: "interactive", global };
  }

  if (!COMMANDS.has(commandToken)) {
    throw new UsageError(`未知命令「${commandToken}」。可用命令：probe, list, help, version。`);
  }

  if (commandToken === "help") return { command: "help", global };
  if (commandToken === "version") return { command: "version", global };

  if (commandToken === "list") {
    assertProbeOnlyFlagsAbsent(values, "list");
    return {
      command: "list",
      global,
      connection: resolveConnectionOptions(values, env),
      filter: optionalString(values.filter),
      exclude: optionalString(values.exclude),
      output: resolveOutputOptions(values),
    };
  }

  // probe
  const selection = resolveSelectionOptions(values);
  if (!selection.all && !selection.models) {
    throw new UsageError("非交互探测需要 --all 或 --models。");
  }
  if (selection.useSavedModels && !optionalString(values.config)) {
    throw new UsageError("--use-saved-models 仅可与 --config 一起使用。");
  }

  return {
    command: "probe",
    global,
    connection: resolveConnectionOptions(values, env),
    selection,
    behavior: resolveBehaviorOptions(values),
    output: resolveOutputOptions(values),
  };
}

function hasNonInteractiveHints(values: CliArgValues): boolean {
  return (
    values.config !== undefined ||
    values.type !== undefined ||
    values["base-url"] !== undefined ||
    values["api-key"] !== undefined ||
    Boolean(values.all) ||
    values.models !== undefined ||
    values.filter !== undefined ||
    values.exclude !== undefined ||
    Boolean(values["use-saved-models"]) ||
    Boolean(values.strict) ||
    values.concurrency !== undefined ||
    values.timeout !== undefined ||
    values.retries !== undefined ||
    Boolean(values.json) ||
    values.output !== undefined
  );
}

function assertProbeOnlyFlagsAbsent(values: CliArgValues, command: string): void {
  const disallowed: Array<[string, boolean]> = [
    ["--all", Boolean(values.all)],
    ["--models", values.models !== undefined],
    ["--use-saved-models", Boolean(values["use-saved-models"])],
    ["--strict", Boolean(values.strict)],
    ["--concurrency", values.concurrency !== undefined],
    ["--timeout", values.timeout !== undefined],
    ["--retries", values.retries !== undefined],
  ];
  const found = disallowed.filter(([, present]) => present).map(([name]) => name);
  if (found.length > 0) {
    throw new UsageError(`命令 ${command} 不支持：${found.join(", ")}`);
  }
}

function resolveConnectionOptions(values: CliArgValues, env: NodeJS.ProcessEnv): ConnectionOptions {
  const configName = optionalString(values.config);
  const typeFlag = optionalString(values.type);
  const baseUrlFlag = optionalString(values["base-url"]);
  const apiKeyFromFlag = values["api-key"] !== undefined;

  let apiType = typeFlag ? parseApiType(typeFlag) : undefined;
  let baseUrl = baseUrlFlag;

  if (!configName) {
    if (!apiType) {
      const envType = optionalString(env.MODELPROBE_API_TYPE);
      if (envType) apiType = parseApiType(envType);
    }
    if (!baseUrl) {
      baseUrl = optionalString(env.MODELPROBE_BASE_URL);
    }
    if (!apiType) {
      throw new UsageError("请通过 --type 或 --config 指定协议类型，也可设置 MODELPROBE_API_TYPE。");
    }
    if (!baseUrl) {
      throw new UsageError("请通过 --base-url 或 --config 指定 Base URL，也可设置 MODELPROBE_BASE_URL。");
    }
    validateBaseUrl(baseUrl);
  } else if (baseUrl) {
    validateBaseUrl(baseUrl);
  }

  let apiKey = "";
  if (apiKeyFromFlag) {
    apiKey = values["api-key"] ?? "";
  } else if (!configName) {
    apiKey = resolveEnvApiKey(apiType, env);
  }
  // When --config is used without --api-key, key is filled later from the saved connection.

  return {
    configName,
    apiType,
    baseUrl,
    apiKey,
    apiKeyFromFlag,
  };
}

export function resolveEnvApiKey(apiType: ApiType | undefined, env: NodeJS.ProcessEnv = process.env): string {
  const generic = optionalString(env.MODELPROBE_API_KEY);
  if (generic) return generic;
  if (apiType === "openai") return optionalString(env.OPENAI_API_KEY) ?? "";
  if (apiType === "anthropic") return optionalString(env.ANTHROPIC_API_KEY) ?? "";
  return "";
}

function resolveSelectionOptions(values: CliArgValues): ModelSelectionOptions {
  const modelsRaw = values.models?.trim();
  let models: string[] | undefined;
  if (modelsRaw !== undefined) {
    models = modelsRaw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    if (models.length === 0) {
      throw new UsageError("--models 不能为空。");
    }
  }

  return {
    all: Boolean(values.all),
    models,
    filter: optionalString(values.filter),
    exclude: optionalString(values.exclude),
    useSavedModels: Boolean(values["use-saved-models"]),
    strict: Boolean(values.strict),
  };
}

function resolveBehaviorOptions(values: CliArgValues): ProbeBehaviorOptions {
  return {
    concurrency: parseIntegerInRange(
      values.concurrency,
      DEFAULT_PROBE_CONCURRENCY,
      1,
      MAX_PROBE_CONCURRENCY,
      "--concurrency",
    ),
    timeoutMs: parsePositiveInteger(values.timeout, PROBE_TIMEOUT_MS, "--timeout"),
    retries: parseNonNegativeInteger(values.retries, PROBE_RETRIES, "--retries"),
  };
}

function resolveOutputOptions(values: CliArgValues): OutputOptions {
  return {
    json: Boolean(values.json),
    outputPath: optionalString(values.output),
  };
}

function parseApiType(value: string): ApiType {
  if (value === "openai" || value === "anthropic" || value === "ollama") return value;
  throw new UsageError(`无效的 --type「${value}」。可选：openai, anthropic, ollama。`);
}

function validateBaseUrl(value: string): void {
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) {
      throw new UsageError("Base URL 仅支持 http:// 或 https://。");
    }
  } catch (error) {
    if (error instanceof UsageError) throw error;
    throw new UsageError(`无效的 Base URL：${value}`);
  }
}

function parseIntegerInRange(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
  flag: string,
): number {
  if (raw === undefined) return fallback;
  if (!/^\d+$/.test(raw.trim())) {
    throw new UsageError(`${flag} 必须是 ${min} 到 ${max} 之间的整数。`);
  }
  const value = Number(raw.trim());
  if (value < min || value > max) {
    throw new UsageError(`${flag} 必须是 ${min} 到 ${max} 之间的整数。`);
  }
  return value;
}

function parsePositiveInteger(raw: string | undefined, fallback: number, flag: string): number {
  if (raw === undefined) return fallback;
  if (!/^\d+$/.test(raw.trim())) {
    throw new UsageError(`${flag} 必须是大于 0 的整数。`);
  }
  const value = Number(raw.trim());
  if (value <= 0) throw new UsageError(`${flag} 必须是大于 0 的整数。`);
  return value;
}

function parseNonNegativeInteger(raw: string | undefined, fallback: number, flag: string): number {
  if (raw === undefined) return fallback;
  if (!/^\d+$/.test(raw.trim())) {
    throw new UsageError(`${flag} 必须是大于或等于 0 的整数。`);
  }
  return Number(raw.trim());
}

function optionalString(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}
