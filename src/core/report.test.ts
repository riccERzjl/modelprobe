import assert from "node:assert/strict";
import test from "node:test";
import { buildProbeReport, computeLatencyStats, fastestSuccesses, summarizeResults } from "./report.js";
import type { ProbeResult } from "../types.js";

const results: ProbeResult[] = [
  { model: { id: "a" }, status: "success", durationMs: 100, attempts: 1, content: "hi" },
  { model: { id: "b" }, status: "success", durationMs: 300, attempts: 2, content: "hello world" },
  { model: { id: "c" }, status: "failed", durationMs: 50, attempts: 1, error: "boom" },
  { model: { id: "d" }, status: "timeout", durationMs: 60000, attempts: 1, error: "timeout" },
  { model: { id: "e" }, status: "success", durationMs: 200, attempts: 1, content: "x".repeat(250) },
];

test("summarizeResults counts statuses and attempts", () => {
  const summary = summarizeResults(results);
  assert.equal(summary.total, 5);
  assert.equal(summary.success, 3);
  assert.equal(summary.failed, 1);
  assert.equal(summary.timeout, 1);
  assert.equal(summary.totalAttempts, 6);
  assert.equal(summary.retriedModels, 1);
  assert.ok(summary.latencyMs);
  assert.equal(summary.latencyMs?.min, 100);
  assert.equal(summary.latencyMs?.avg, 200);
});

test("computeLatencyStats returns null without successes", () => {
  assert.equal(computeLatencyStats(results.filter((item) => item.status !== "success")), null);
});

test("fastestSuccesses orders by duration", () => {
  assert.deepEqual(fastestSuccesses(results, 2), [
    { id: "a", durationMs: 100 },
    { id: "e", durationMs: 200 },
  ]);
});

test("buildProbeReport omits secrets and truncates content", () => {
  const report = buildProbeReport({
    startedAt: new Date("2026-01-01T00:00:00.000Z"),
    finishedAt: new Date("2026-01-01T00:01:00.000Z"),
    connection: {
      source: "cli",
      apiType: "openai",
      baseUrl: "https://api.example.com/v1",
    },
    options: {
      concurrency: 5,
      timeoutMs: 60_000,
      retries: 1,
      all: true,
      useSavedModels: false,
      strict: false,
      models: null,
    },
    results,
  });

  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes("apiKey"), false);
  assert.equal(serialized.includes("sk-"), false);
  const long = report.results.find((item) => item.model === "e");
  assert.ok(long?.content && long.content.endsWith("…"));
  assert.ok((long?.content?.length ?? 0) <= 201);
  assert.equal(report.summary.success, 3);
  assert.deepEqual(report.usableModels, ["a", "b", "e"]);
});
