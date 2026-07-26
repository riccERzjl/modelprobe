import { ApiRequestError } from "../adapters/base.js";

export interface RetryEvent {
  /** The request that failed and will be retried. */
  attempt: number;
  /** The next request attempt number. */
  nextAttempt: number;
  error: unknown;
  delayMs: number;
}

export interface RetryOptions {
  /** Number of retries after the initial request. */
  retries: number;
  /** Absolute deadline measured with performance.now(), if the operation has one. */
  deadlineAt?: number;
  signal: AbortSignal;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterMs: number;
  onRetry?: (event: RetryEvent) => void;
}

export interface RetryExecution<T> {
  value: T;
  attempts: number;
}

/** Thrown when no time remains to perform the next retry within an operation's deadline. */
export class RetryDeadlineExceededError extends Error {
  constructor() {
    super("请求在重试前已达到时间上限。");
    this.name = "RetryDeadlineExceededError";
  }
}

/**
 * Execute an operation with bounded, retryable failures. The caller owns the
 * AbortController and deadline so one operation's total timeout includes every
 * request attempt and every backoff wait.
 */
export async function retryWithBackoff<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions,
): Promise<RetryExecution<T>> {
  let attempt = 0;

  while (true) {
    attempt += 1;
    try {
      return { value: await operation(attempt), attempts: attempt };
    } catch (error) {
      if (options.signal.aborted || !isRetryableError(error) || attempt > options.retries) {
        throw error;
      }

      const delayMs = getRetryDelay(error, attempt, options);
      const remainingMs = getRemainingMs(options.deadlineAt);
      if (remainingMs !== undefined && delayMs >= remainingMs) {
        throw new RetryDeadlineExceededError();
      }

      options.onRetry?.({
        attempt,
        nextAttempt: attempt + 1,
        error,
        delayMs,
      });
      await sleep(delayMs, options.signal);
    }
  }
}

export function isRetryableError(error: unknown): boolean {
  if (!(error instanceof ApiRequestError)) return false;
  if (error.status === undefined) return true;
  return error.status === 408 || error.status === 429 || error.status >= 500;
}

function getRetryDelay(error: unknown, attempt: number, options: RetryOptions): number {
  const exponentialDelay = Math.min(options.maxDelayMs, options.baseDelayMs * 2 ** (attempt - 1));
  const jitter = options.jitterMs > 0 ? Math.floor(Math.random() * (options.jitterMs + 1)) : 0;
  const localDelay = exponentialDelay + jitter;
  const serverDelay = error instanceof ApiRequestError ? error.retryAfterMs : undefined;
  return Math.max(localDelay, serverDelay ?? 0);
}

function getRemainingMs(deadlineAt: number | undefined): number | undefined {
  if (deadlineAt === undefined) return undefined;
  return Math.max(0, deadlineAt - performance.now());
}

function sleep(delayMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, delayMs);

    const onAbort = () => {
      cleanup();
      reject(signal.reason ?? new Error("请求已取消。"));
    };

    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    };

    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
