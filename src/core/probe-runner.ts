import { writeFile } from "node:fs/promises";
import { createAdapter } from "../adapters/index.js";
import type { OutputOptions, ProbeBehaviorOptions, ModelSelectionOptions } from "../cli/args.js";
import { discoverModels } from "../services/model-discovery.js";
import { probeModels } from "../services/probe-service.js";
import type { ModelInfo, ProbeResult } from "../types.js";
import { describeConnection, type ResolvedConnection } from "./connection.js";
import { ModelSelectionError, selectModels } from "./model-selection.js";
import { buildProbeReport, type ProbeReport } from "./report.js";

export interface ProbeRunHooks {
  onFetchStart?: () => void;
  onFetchRetry?: (attempt: number, delayMs: number, error: unknown) => void;
  onModelsLoaded?: (models: ModelInfo[]) => void;
  onUsingSavedModels?: (count: number) => void;
  onSelectionWarnings?: (warnings: string[]) => void;
  onProbeStart?: (modelCount: number, concurrency: number) => void;
  onProbeResult?: (result: ProbeResult) => void;
  onProbeRetry?: (model: ModelInfo, attempt: number, delayMs: number, error: unknown) => void;
}

export interface ProbeRunInput {
  connection: ResolvedConnection;
  selection: ModelSelectionOptions;
  behavior: ProbeBehaviorOptions;
  output: OutputOptions;
  hooks?: ProbeRunHooks;
}

export interface ProbeRunResult {
  report: ProbeReport;
  results: ProbeResult[];
  exitCode: number;
}

export async function runProbeSession(input: ProbeRunInput): Promise<ProbeRunResult> {
  const startedAt = new Date();
  const adapter = createAdapter(input.connection.config);
  const hooks = input.hooks ?? {};

  let universe: ModelInfo[];
  if (input.selection.useSavedModels) {
    const savedModels = input.connection.saved?.models ?? [];
    hooks.onUsingSavedModels?.(savedModels.length);
    universe = savedModels;
  } else {
    hooks.onFetchStart?.();
    universe = await discoverModels(adapter, {
      onRetry: (event) => hooks.onFetchRetry?.(event.nextAttempt, event.delayMs, event.error),
    });
    hooks.onModelsLoaded?.(universe);
  }

  const { selected, warnings } = selectModels(universe, {
    filter: input.selection.filter,
    exclude: input.selection.exclude,
    models: input.selection.models,
    strict: input.selection.strict,
  });
  if (warnings.length > 0) hooks.onSelectionWarnings?.(warnings);

  if (selected.length === 0) {
    throw new ModelSelectionError("没有可探测的模型。");
  }

  hooks.onProbeStart?.(selected.length, input.behavior.concurrency);
  const results = await probeModels(adapter, selected, (result) => hooks.onProbeResult?.(result), {
    concurrency: input.behavior.concurrency,
    timeoutMs: input.behavior.timeoutMs,
    retries: input.behavior.retries,
    onRetry: (model, event) => hooks.onProbeRetry?.(model, event.nextAttempt, event.delayMs, event.error),
  });

  const finishedAt = new Date();
  const report = buildProbeReport({
    startedAt,
    finishedAt,
    connection: describeConnection(input.connection),
    options: {
      concurrency: input.behavior.concurrency,
      timeoutMs: input.behavior.timeoutMs,
      retries: input.behavior.retries,
      filter: input.selection.filter,
      exclude: input.selection.exclude,
      models: input.selection.models ?? null,
      all: input.selection.all,
      useSavedModels: input.selection.useSavedModels,
      strict: input.selection.strict,
    },
    results,
  });

  if (input.output.outputPath) {
    await writeFile(input.output.outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  const exitCode = report.summary.success > 0 ? 0 : 1;
  return { report, results, exitCode };
}
