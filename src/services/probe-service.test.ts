import assert from "node:assert/strict";
import test from "node:test";
import { ApiRequestError } from "../adapters/base.js";
import { discoverModels, ModelListTimeoutError } from "./model-discovery.js";
import { probeModels } from "./probe-service.js";
import type { ModelApiAdapter, ModelInfo, ProbeSuccess } from "../types.js";

const models: ModelInfo[] = Array.from({ length: 12 }, (_, index) => ({ id: `model-${index + 1}` }));

class FakeAdapter implements ModelApiAdapter {
  constructor(
    private readonly onProbe: (model: ModelInfo, signal: AbortSignal) => Promise<ProbeSuccess>,
    private readonly onList: (signal?: AbortSignal) => Promise<ModelInfo[]> = async () => models,
  ) {}

  listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    return this.onList(signal);
  }

  probe(model: ModelInfo, signal: AbortSignal): Promise<ProbeSuccess> {
    return this.onProbe(model, signal);
  }
}

test("probeModels returns an empty result set without creating workers", async () => {
  const adapter = new FakeAdapter(async () => {
    throw new Error("probe should not be called");
  });

  const results = await probeModels(adapter, [], () => undefined);

  assert.deepEqual(results, []);
});

test("probeModels limits active probes to the configured concurrency and preserves input order", async () => {
  let active = 0;
  let maxActive = 0;
  const adapter = new FakeAdapter(async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await delay(10);
    active -= 1;
    return { content: "ok" };
  });
  const completionOrder: string[] = [];

  const results = await probeModels(adapter, models, (result) => completionOrder.push(result.model.id), {
    concurrency: 10,
    retries: 0,
  });

  assert.equal(maxActive, 10);
  assert.deepEqual(results.map((result) => result.model.id), models.map((model) => model.id));
  assert.equal(completionOrder.length, models.length);
});

test("probeModels retries transient HTTP failures and exposes the second attempt", async () => {
  let calls = 0;
  const retryEvents: number[] = [];
  const adapter = new FakeAdapter(async () => {
    calls += 1;
    if (calls === 1) throw new ApiRequestError("HTTP 503", 503);
    return { content: "ok" };
  });

  const [result] = await probeModels(adapter, [models[0]], () => undefined, {
    retries: 1,
    retryBaseDelayMs: 1,
    retryJitterMs: 0,
    onRetry: (_model, event) => retryEvents.push(event.nextAttempt),
  });

  assert.equal(calls, 2);
  assert.equal(result.status, "success");
  assert.equal(result.attempts, 2);
  assert.deepEqual(retryEvents, [2]);
});

test("probeModels does not retry non-retryable HTTP failures", async () => {
  let calls = 0;
  const adapter = new FakeAdapter(async () => {
    calls += 1;
    throw new ApiRequestError("HTTP 401", 401);
  });

  const [result] = await probeModels(adapter, [models[0]], () => undefined, {
    retries: 1,
    retryBaseDelayMs: 1,
    retryJitterMs: 0,
  });

  assert.equal(calls, 1);
  assert.equal(result.status, "failed");
  assert.equal(result.attempts, 1);
});

test("probeModels cancels a hanging request when its total timeout expires", async () => {
  let calls = 0;
  const adapter = new FakeAdapter(async (_model, signal) => {
    calls += 1;
    await waitForAbort(signal);
    throw signal.reason;
  });

  const [result] = await probeModels(adapter, [models[0]], () => undefined, {
    retries: 1,
    timeoutMs: 20,
    retryBaseDelayMs: 1,
    retryJitterMs: 0,
  });

  assert.equal(calls, 1);
  assert.equal(result.status, "timeout");
  assert.equal(result.attempts, 1);
});

test("discoverModels honors Retry-After for a transient model-list error", async () => {
  let calls = 0;
  let observedDelay = 0;
  const adapter = new FakeAdapter(
    async () => ({ content: "unused" }),
    async () => {
      calls += 1;
      if (calls === 1) throw new ApiRequestError("HTTP 429", 429, undefined, 25);
      return [models[0]];
    },
  );

  const listed = await discoverModels(adapter, {
    retries: 1,
    retryBaseDelayMs: 1,
    retryJitterMs: 0,
    onRetry: (event) => {
      observedDelay = event.delayMs;
    },
  });

  assert.equal(calls, 2);
  assert.equal(observedDelay, 25);
  assert.deepEqual(listed, [models[0]]);
});

test("discoverModels aborts a hanging list request at its total timeout", async () => {
  const adapter = new FakeAdapter(
    async () => ({ content: "unused" }),
    async (signal) => {
      assert.ok(signal);
      await waitForAbort(signal);
      throw signal.reason;
    },
  );

  await assert.rejects(
    discoverModels(adapter, { timeoutMs: 20, retries: 0 }),
    (error: unknown) => error instanceof ModelListTimeoutError && error.attempts === 1,
  );
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForAbort(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
}
