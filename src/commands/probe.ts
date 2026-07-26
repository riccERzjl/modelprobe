import chalk from "chalk";
import type { ParsedCli } from "../cli/args.js";
import { resolveConnection } from "../core/connection.js";
import { ModelSelectionError } from "../core/model-selection.js";
import { runProbeSession } from "../core/probe-runner.js";
import {
  printEmptyModelList,
  printFetchError,
  printFetchRetry,
  printModels,
  printProbeResult,
  printProbeRetry,
  printProbeStart,
  printSummary,
  printUsableModels,
  printUsingSavedModels,
  printLatencyStats,
  printOutputSaved,
} from "../ui/terminal.js";

export async function runProbeCommand(options: Extract<ParsedCli, { command: "probe" }>): Promise<number> {
  const connection = await resolveConnection(options.connection);
  const jsonMode = options.output.json;
  const quiet = options.global.quiet;

  try {
    const { report, results, exitCode } = await runProbeSession({
      connection,
      selection: options.selection,
      behavior: options.behavior,
      output: options.output,
      hooks: {
        onFetchStart: () => {
          if (jsonMode) {
            if (!quiet) console.error("正在获取模型...");
          } else if (!quiet) {
            console.log("\n正在获取模型...");
          }
        },
        onFetchRetry: (attempt, delayMs, error) => {
          if (quiet) return;
          if (jsonMode) {
            console.error(`获取模型重试：第 ${attempt} 次，等待 ${delayMs} ms — ${formatErr(error)}`);
          } else {
            printFetchRetry(attempt, delayMs, error);
          }
        },
        onModelsLoaded: (models) => {
          if (!jsonMode && !quiet) printModels(models);
        },
        onUsingSavedModels: (count) => {
          if (!jsonMode && !quiet) printUsingSavedModels(count);
        },
        onSelectionWarnings: (warnings) => {
          for (const warning of warnings) {
            console.error(chalk.yellow(warning));
          }
        },
        onProbeStart: (modelCount, concurrency) => {
          if (jsonMode) {
            if (!quiet) console.error(`开始探测 ${modelCount} 个模型（并发 ${concurrency}）...`);
          } else if (!quiet) {
            printProbeStart(modelCount, concurrency, options.behavior.timeoutMs, options.behavior.retries);
          }
        },
        onProbeResult: (result) => {
          if (!jsonMode && !quiet) printProbeResult(result);
        },
        onProbeRetry: (model, attempt, delayMs, error) => {
          if (quiet) return;
          if (jsonMode) {
            console.error(`${model.id} 重试：第 ${attempt} 次，等待 ${delayMs} ms — ${formatErr(error)}`);
          } else {
            printProbeRetry(model, attempt, delayMs, error);
          }
        },
      },
    });

    if (jsonMode) {
      console.log(JSON.stringify(report, null, 2));
      if (options.output.outputPath && !quiet) {
        console.error(`结果已写入：${options.output.outputPath}`);
      }
    } else if (!quiet) {
      printSummary(results);
      printLatencyStats(results);
      printUsableModels(results);
      if (options.output.outputPath) printOutputSaved(options.output.outputPath);
    } else if (options.output.outputPath) {
      printOutputSaved(options.output.outputPath);
    }

    return exitCode;
  } catch (error) {
    if (error instanceof ModelSelectionError) {
      console.error(chalk.red(error.message));
      if (!jsonMode) printEmptyModelList();
      return 1;
    }
    if (!jsonMode) printFetchError(error);
    else console.error(formatErr(error));
    return 1;
  }
}

function formatErr(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
