import assert from "node:assert/strict";
import test from "node:test";
import { ModelSelectionError, selectModels } from "./model-selection.js";

const models = [
  { id: "gpt-4o" },
  { id: "gpt-4o-mini" },
  { id: "text-embedding-3" },
  { id: "qwen-plus" },
];

test("filter and exclude are case-insensitive", () => {
  const { selected, warnings } = selectModels(models, {
    filter: "GPT",
    exclude: "mini",
  });
  assert.deepEqual(
    selected.map((item) => item.id),
    ["gpt-4o"],
  );
  assert.deepEqual(warnings, []);
});

test("explicit models intersect with filtered set and warn on missing", () => {
  const { selected, warnings } = selectModels(models, {
    filter: "gpt",
    models: ["gpt-4o", "missing", "text-embedding-3"],
  });
  assert.deepEqual(
    selected.map((item) => item.id),
    ["gpt-4o"],
  );
  assert.equal(warnings.length, 2);
});

test("strict mode fails on unknown model ids", () => {
  assert.throws(
    () => selectModels(models, { models: ["nope"], strict: true }),
    ModelSelectionError,
  );
});

test("strict mode fails on empty selection", () => {
  assert.throws(
    () => selectModels(models, { filter: "no-match", strict: true }),
    ModelSelectionError,
  );
});

test("invalid regex is rejected", () => {
  assert.throws(() => selectModels(models, { filter: "(" }), ModelSelectionError);
});

test("empty selection without strict returns empty list", () => {
  const { selected } = selectModels(models, { filter: "no-match" });
  assert.deepEqual(selected, []);
});
