import assert from "node:assert/strict";
import test from "node:test";
import { resolveConfigPath, resolveLegacyConfigPath } from "./config-store.js";

test("resolves Linux config paths from absolute XDG_CONFIG_HOME", () => {
  const path = resolveConfigPath({
    platform: "linux",
    homeDir: "/home/alice",
    env: { XDG_CONFIG_HOME: "/srv/config" },
  });

  assert.equal(path, "/srv/config/modelprobe/connections.json");
});

test("falls back to the Linux XDG default when XDG_CONFIG_HOME is absent or relative", () => {
  assert.equal(
    resolveConfigPath({ platform: "linux", homeDir: "/home/alice", env: {} }),
    "/home/alice/.config/modelprobe/connections.json",
  );
  assert.equal(
    resolveConfigPath({ platform: "linux", homeDir: "/home/alice", env: { XDG_CONFIG_HOME: "config" } }),
    "/home/alice/.config/modelprobe/connections.json",
  );
});

test("resolves the macOS Application Support config path", () => {
  const path = resolveConfigPath({
    platform: "darwin",
    homeDir: "/Users/alice",
    env: {},
  });

  assert.equal(path, "/Users/alice/Library/Application Support/modelprobe/connections.json");
});

test("resolves the Windows APPDATA config path", () => {
  const path = resolveConfigPath({
    platform: "win32",
    homeDir: "C:\\Users\\Alice",
    env: { APPDATA: "C:\\Users\\Alice\\AppData\\Roaming" },
  });

  assert.equal(path, "C:\\Users\\Alice\\AppData\\Roaming\\modelprobe\\connections.json");
});

test("falls back to the Windows Roaming AppData path without an absolute APPDATA", () => {
  const options = { platform: "win32" as const, homeDir: "C:\\Users\\Alice" };
  assert.equal(
    resolveConfigPath({ ...options, env: {} }),
    "C:\\Users\\Alice\\AppData\\Roaming\\modelprobe\\connections.json",
  );
  assert.equal(
    resolveConfigPath({ ...options, env: { APPDATA: "AppData\\Roaming" } }),
    "C:\\Users\\Alice\\AppData\\Roaming\\modelprobe\\connections.json",
  );
});

test("retains the prior hidden-home path as a migration source", () => {
  assert.equal(
    resolveLegacyConfigPath({ platform: "linux", homeDir: "/home/alice" }),
    "/home/alice/.modelprobe/connections.json",
  );
  assert.equal(
    resolveLegacyConfigPath({ platform: "darwin", homeDir: "/Users/alice" }),
    "/Users/alice/.modelprobe/connections.json",
  );
  assert.equal(
    resolveLegacyConfigPath({ platform: "win32", homeDir: "C:\\Users\\Alice" }),
    "C:\\Users\\Alice\\.modelprobe\\connections.json",
  );
});
