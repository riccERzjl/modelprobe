import type { ModelApiAdapter, ModelInfo, ProbeResult } from "../types.js";

const PROBE_TIMEOUT_MS = 30_000;

export async function probeModels(
  adapter: ModelApiAdapter,
  models: ModelInfo[],
  onResult: (result: ProbeResult) => void,
): Promise<ProbeResult[]> {
  const promises = models.map(async (model) => {
    const result = await probeOne(adapter, model);
    onResult(result);
    return result;
  });
  return Promise.all(promises);
}

async function probeOne(adapter: ModelApiAdapter, model: ModelInfo): Promise<ProbeResult> {
  const controller = new AbortController();
  const startedAt = performance.now();
  let didTimeout = false;
  const timer = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, PROBE_TIMEOUT_MS);

  try {
    const response = await adapter.probe(model, controller.signal);
    return {
      model,
      status: "success",
      durationMs: elapsed(startedAt),
      content: response.content,
    };
  } catch (error) {
    return {
      model,
      status: didTimeout ? "timeout" : "failed",
      durationMs: elapsed(startedAt),
      error: didTimeout ? `请求超过 ${PROBE_TIMEOUT_MS / 1000} 秒` : formatProbeError(error),
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
