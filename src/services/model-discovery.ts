import type { ModelApiAdapter, ModelInfo } from "../types.js";
import {
  RetryDeadlineExceededError,
  retryWithBackoff,
  type RetryEvent,
} from "./retry.js";

export const MODEL_LIST_TIMEOUT_MS = 30_000;
export const MODEL_LIST_RETRIES = 2;

export interface ModelDiscoveryOptions {
  timeoutMs?: number;
  retries?: number;
  onRetry?: (event: RetryEvent) => void;
  /** Primarily for deterministic tests; production defaults are intentionally conservative. */
  retryBaseDelayMs?: number;
  retryMaxDelayMs?: number;
  retryJitterMs?: number;
}

export class ModelListTimeoutError extends Error {
  constructor(
    public readonly timeoutMs: number,
    public readonly attempts: number,
  ) {
    super(`获取模型列表超过 ${Math.round(timeoutMs / 1_000)} 秒，已取消请求。`);
    this.name = "ModelListTimeoutError";
  }
}

/**
 * Fetch a remote model list with a single end-to-end deadline. The deadline
 * covers every HTTP attempt and each retry backoff, and cancels fetch via its
 * AbortSignal when it expires.
 */
export async function discoverModels(
  adapter: ModelApiAdapter,
  options: ModelDiscoveryOptions = {},
): Promise<ModelInfo[]> {
  const timeoutMs = options.timeoutMs ?? MODEL_LIST_TIMEOUT_MS;
  const retries = options.retries ?? MODEL_LIST_RETRIES;
  assertPositiveInteger("模型列表超时", timeoutMs);
  assertNonNegativeInteger("模型列表重试次数", retries);

  const controller = new AbortController();
  const startedAt = performance.now();
  const deadlineAt = startedAt + timeoutMs;
  let didTimeout = false;
  let attempts = 0;
  const timer = setTimeout(() => {
    didTimeout = true;
    controller.abort(new Error("获取模型列表超时。"));
  }, timeoutMs);

  try {
    const execution = await retryWithBackoff(
      async (attempt) => {
        attempts = attempt;
        return adapter.listModels(controller.signal);
      },
      {
        retries,
        deadlineAt,
        signal: controller.signal,
        baseDelayMs: options.retryBaseDelayMs ?? 500,
        maxDelayMs: options.retryMaxDelayMs ?? 4_000,
        jitterMs: options.retryJitterMs ?? 250,
        onRetry: options.onRetry,
      },
    );
    return execution.value;
  } catch (error) {
    if (didTimeout || error instanceof RetryDeadlineExceededError) {
      throw new ModelListTimeoutError(timeoutMs, attempts);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function assertPositiveInteger(label: string, value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label}必须是大于 0 的整数。`);
  }
}

function assertNonNegativeInteger(label: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label}必须是大于或等于 0 的整数。`);
  }
}
