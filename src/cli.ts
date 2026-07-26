#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCliArgs, UsageError } from "./cli/args.js";
import { printUsage, printVersion } from "./cli/help.js";
import { runInteractiveCommand } from "./commands/interactive.js";
import { runListCommand } from "./commands/list.js";
import { runProbeCommand } from "./commands/probe.js";
import { ConnectionResolveError } from "./core/connection.js";
import { ModelSelectionError } from "./core/model-selection.js";

async function main(): Promise<void> {
  let parsed;
  try {
    parsed = parseCliArgs();
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(`参数错误：${error.message}\n`);
      printUsage(process.stderr);
      process.exitCode = 2;
      return;
    }
    throw error;
  }

  if (parsed.global.noColor) {
    process.env.NO_COLOR = "1";
  }

  try {
    switch (parsed.command) {
      case "help":
        printUsage();
        return;
      case "version":
        printVersion(readPackageVersion());
        return;
      case "interactive": {
        const code = await runInteractiveCommand();
        process.exitCode = code;
        return;
      }
      case "list": {
        const code = await runListCommand(parsed);
        process.exitCode = code;
        return;
      }
      case "probe": {
        const code = await runProbeCommand(parsed);
        process.exitCode = code;
        return;
      }
    }
  } catch (error) {
    if (error instanceof UsageError || error instanceof ConnectionResolveError || error instanceof ModelSelectionError) {
      console.error(error.message);
      process.exitCode = error instanceof UsageError ? 2 : 1;
      return;
    }
    throw error;
  }
}

function readPackageVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    // dist/cli.js -> ../package.json; src via tsx -> ../package.json
    const packagePath = join(here, "..", "package.json");
    const raw = readFileSync(packagePath, "utf8");
    const pkg = JSON.parse(raw) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\n程序异常退出：${message}`);
  process.exitCode = 1;
});
