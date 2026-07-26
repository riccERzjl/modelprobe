import type { ModelApiAdapter, ModelInfo, ProbeResult } from "../types.js";
import {
  RetryDeadlineExceededError,
  retryWithBackoff,
  type RetryEvent,
} from "./retry.js";

export const PROBE_TIMEOUT_MS = 60_000;
export const DEFAULT_PROBE_CONCURRENCY = 5;
export const MAX_PROBE_CONCURRENCY = 10;
export const PROBE_RETRIES = 1;

export interface ProbeOptions {
  /** Maximum number of models actively being probed. Must be between 1 and 10. */
  concurrency?: number;
  /** End-to-end time budget per model, including retry waits and all attempts. */
  timeoutMs?: number;
  /** Number of retries after an initial probe request. */
  retries?: number;
  onRetry?: (model: ModelInfo, event: RetryEvent) => void;
  /** Primarily for deterministic tests; production defaults are intentionally conservative. */
  retryBaseDelayMs?: number;
  retryMaxDelayMs?: number;
  retryJitterMs?: number;
}

export async function probeModels(
  adapter: ModelApiAdapter,
  models: ModelInfo[],
  onResult: (result: ProbeResult) => void,
  options: ProbeOptions = {},
): Promise<ProbeResult[]> {
  const resolved = resolveProbeOptions(options);
  const results: ProbeResult[] = new Array(models.length);
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= models.length) return;

      const result = await probeOne(adapter, models[index], resolved);
      results[index] = result;
      onResult(result);
    }
  };

  const workerCount = Math.min(resolved.concurrency, models.length);
  if (workerCount === 0) return [];
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

interface ResolvedProbeOptions {
  concurrency: number;
  timeoutMs: number;
  retries: number;
  onRetry?: (model: ModelInfo, event: RetryEvent) => void;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
  retryJitterMs: number;
}

function resolveProbeOptions(options: ProbeOptions): ResolvedProbeOptions {
  const concurrency = options.concurrency ?? DEFAULT_PROBE_CONCURRENCY;
  const timeoutMs = options.timeoutMs ?? PROBE_TIMEOUT_MS;
  const retries = options.retries ?? PROBE_RETRIES;

  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > MAX_PROBE_CONCURRENCY) {
    throw new Error(`探测并发数必须是 1 到 ${MAX_PROBE_CONCURRENCY} 之间的整数。`);
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error("探测超时必须是大于 0 的整数。");
  }
  if (!Number.isInteger(retries) || retries < 0) {
    throw new Error("探测重试次数必须是大于或等于 0 的整数。");
  }

  return {
    concurrency,
    timeoutMs,
    retries,
    onRetry: options.onRetry,
    retryBaseDelayMs: options.retryBaseDelayMs ?? 500,
    retryMaxDelayMs: options.retryMaxDelayMs ?? 4_000,
    retryJitterMs: options.retryJitterMs ?? 250,
  };
}

async function probeOne(
  adapter: ModelApiAdapter,
  model: ModelInfo,
  options: ResolvedProbeOptions,
): Promise<ProbeResult> {
  const controller = new AbortController();
  const startedAt = performance.now();
  const deadlineAt = startedAt + options.timeoutMs;
  let didTimeout = false;
  let attempts = 0;
  const timer = setTimeout(() => {
    didTimeout = true;
    controller.abort(new Error("模型探测超时。"));
  }, options.timeoutMs);

  try {
    const execution = await retryWithBackoff(
      async (attempt) => {
        attempts = attempt;
        return adapter.probe(model, controller.signal);
      },
      {
        retries: options.retries,
        deadlineAt,
        signal: controller.signal,
        baseDelayMs: options.retryBaseDelayMs,
        maxDelayMs: options.retryMaxDelayMs,
        jitterMs: options.retryJitterMs,
        onRetry: (event) => options.onRetry?.(model, event),
      },
    );
    return {
      model,
      status: "success",
      durationMs: elapsed(startedAt),
      attempts: execution.attempts,
      content: execution.value.content,
    };
  } catch (error) {
    const timedOut = didTimeout || error instanceof RetryDeadlineExceededError;
    return {
      model,
      status: timedOut ? "timeout" : "failed",
      durationMs: elapsed(startedAt),
      attempts,
      error: timedOut
        ? `请求超过 ${options.timeoutMs / 1_000} 秒`
        : formatProbeError(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

function elapsed(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}

function formatProbeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return String(error);
}
