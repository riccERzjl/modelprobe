import assert from "node:assert/strict";
import test from "node:test";
import { parseCliArgs, UsageError } from "./args.js";

test("no args enters interactive mode", () => {
  const parsed = parseCliArgs([], {});
  assert.equal(parsed.command, "interactive");
});

test("help and version commands", () => {
  assert.equal(parseCliArgs(["help"], {}).command, "help");
  assert.equal(parseCliArgs(["version"], {}).command, "version");
  assert.equal(parseCliArgs(["--help"], {}).command, "help");
  assert.equal(parseCliArgs(["-V"], {}).command, "version");
});

test("probe requires --all or --models", () => {
  assert.throws(
    () => parseCliArgs(["probe", "--type", "openai", "--base-url", "https://api.example.com"], {}),
    (error: unknown) => error instanceof UsageError && /--all 或 --models/.test(error.message),
  );
});

test("probe accepts cli connection flags and env fallbacks", () => {
  const parsed = parseCliArgs(
    ["probe", "--all", "--base-url", "https://api.example.com/v1"],
    { MODELPROBE_API_TYPE: "openai", MODELPROBE_API_KEY: "sk-env" },
  );
  assert.equal(parsed.command, "probe");
  if (parsed.command !== "probe") return;
  assert.equal(parsed.connection.apiType, "openai");
  assert.equal(parsed.connection.baseUrl, "https://api.example.com/v1");
  assert.equal(parsed.connection.apiKey, "sk-env");
  assert.equal(parsed.selection.all, true);
  assert.equal(parsed.behavior.concurrency, 5);
});

test("probe --config does not require type/base-url", () => {
  const parsed = parseCliArgs(["probe", "--config", "gateway", "--models", "a,b"], {});
  assert.equal(parsed.command, "probe");
  if (parsed.command !== "probe") return;
  assert.equal(parsed.connection.configName, "gateway");
  assert.deepEqual(parsed.selection.models, ["a", "b"]);
});

test("use-saved-models requires --config", () => {
  assert.throws(
    () =>
      parseCliArgs(
        ["probe", "--type", "ollama", "--base-url", "http://localhost:11434", "--all", "--use-saved-models"],
        {},
      ),
    UsageError,
  );
});

test("list rejects probe-only flags", () => {
  assert.throws(
    () => parseCliArgs(["list", "--type", "ollama", "--base-url", "http://localhost:11434", "--all"], {}),
    UsageError,
  );
});

test("flags without subcommand are rejected", () => {
  assert.throws(() => parseCliArgs(["--json"], {}), UsageError);
});

test("invalid type and concurrency are rejected", () => {
  assert.throws(
    () => parseCliArgs(["probe", "--type", "foo", "--base-url", "http://x", "--all"], {}),
    UsageError,
  );
  assert.throws(
    () =>
      parseCliArgs(
        ["probe", "--type", "openai", "--base-url", "https://x", "--all", "--concurrency", "99"],
        {},
      ),
    UsageError,
  );
});

test("OPENAI_API_KEY is used for openai type", () => {
  const parsed = parseCliArgs(
    ["probe", "--type", "openai", "--base-url", "https://api.example.com", "--all"],
    { OPENAI_API_KEY: "sk-openai" },
  );
  assert.equal(parsed.command, "probe");
  if (parsed.command !== "probe") return;
  assert.equal(parsed.connection.apiKey, "sk-openai");
});
