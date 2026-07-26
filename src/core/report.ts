import type { ApiType, ProbeResult } from "../types.js";

export const REPORT_VERSION = 1 as const;
export const CONTENT_TRUNCATE_CHARS = 200;

export interface LatencyStats {
  min: number;
  avg: number;
  p50: number;
  p95: number;
}

export interface ProbeReportSummary {
  total: number;
  success: number;
  failed: number;
  timeout: number;
  totalAttempts: number;
  retriedModels: number;
  latencyMs: LatencyStats | null;
}

export interface ProbeReport {
  version: typeof REPORT_VERSION;
  command: "probe";
  startedAt: string;
  finishedAt: string;
  connection: {
    source: "config" | "cli";
    name?: string;
    apiType: ApiType;
    baseUrl: string;
  };
  options: {
    concurrency: number;
    timeoutMs: number;
    retries: number;
    filter?: string;
    exclude?: string;
    models?: string[] | null;
    all: boolean;
    useSavedModels: boolean;
    strict: boolean;
  };
  summary: ProbeReportSummary;
  usableModels: string[];
  results: Array<{
    model: string;
    status: ProbeResult["status"];
    durationMs?: number;
    attempts?: number;
    content: string | null;
    error: string | null;
  }>;
}

export interface ListReport {
  version: typeof REPORT_VERSION;
  command: "list";
  startedAt: string;
  finishedAt: string;
  connection: {
    source: "config" | "cli";
    name?: string;
    apiType: ApiType;
    baseUrl: string;
  };
  options: {
    filter?: string;
    exclude?: string;
  };
  models: string[];
  total: number;
}

export function buildProbeReport(input: {
  startedAt: Date;
  finishedAt: Date;
  connection: ProbeReport["connection"];
  options: ProbeReport["options"];
  results: ProbeResult[];
}): ProbeReport {
  const summary = summarizeResults(input.results);
  return {
    version: REPORT_VERSION,
    command: "probe",
    startedAt: input.startedAt.toISOString(),
    finishedAt: input.finishedAt.toISOString(),
    connection: input.connection,
    options: input.options,
    summary,
    usableModels: input.results.filter((item) => item.status === "success").map((item) => item.model.id),
    results: input.results.map((item) => ({
      model: item.model.id,
      status: item.status,
      durationMs: item.durationMs,
      attempts: item.attempts,
      content: item.status === "success" ? truncate(item.content) : null,
      error: item.status === "success" ? null : (item.error ?? "未知错误"),
    })),
  };
}

export function buildListReport(input: {
  startedAt: Date;
  finishedAt: Date;
  connection: ListReport["connection"];
  options: ListReport["options"];
  models: string[];
}): ListReport {
  return {
    version: REPORT_VERSION,
    command: "list",
    startedAt: input.startedAt.toISOString(),
    finishedAt: input.finishedAt.toISOString(),
    connection: input.connection,
    options: input.options,
    models: input.models,
    total: input.models.length,
  };
}

export function summarizeResults(results: ProbeResult[]): ProbeReportSummary {
  const success = results.filter((item) => item.status === "success").length;
  const failed = results.filter((item) => item.status === "failed").length;
  const timeout = results.filter((item) => item.status === "timeout").length;
  const totalAttempts = results.reduce((total, item) => total + (item.attempts ?? 1), 0);
  const retriedModels = results.filter((item) => (item.attempts ?? 1) > 1).length;
  return {
    total: results.length,
    success,
    failed,
    timeout,
    totalAttempts,
    retriedModels,
    latencyMs: computeLatencyStats(results),
  };
}

export function computeLatencyStats(results: ProbeResult[]): LatencyStats | null {
  const samples = results
    .filter((item) => item.status === "success" && typeof item.durationMs === "number")
    .map((item) => item.durationMs as number)
    .sort((a, b) => a - b);

  if (samples.length === 0) return null;

  const sum = samples.reduce((total, value) => total + value, 0);
  return {
    min: samples[0],
    avg: Math.round(sum / samples.length),
    p50: percentile(samples, 0.5),
    p95: percentile(samples, 0.95),
  };
}

export function fastestSuccesses(results: ProbeResult[], limit = 3): Array<{ id: string; durationMs: number }> {
  return results
    .filter((item) => item.status === "success" && typeof item.durationMs === "number")
    .map((item) => ({ id: item.model.id, durationMs: item.durationMs as number }))
    .sort((a, b) => a.durationMs - b.durationMs || a.id.localeCompare(b.id))
    .slice(0, limit);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 1) return sorted[0];
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[index];
}

function truncate(value: string | undefined): string | null {
  if (value === undefined) return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= CONTENT_TRUNCATE_CHARS) return normalized;
  return `${normalized.slice(0, CONTENT_TRUNCATE_CHARS)}…`;
}
