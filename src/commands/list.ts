import { writeFile } from "node:fs/promises";
import chalk from "chalk";
import { createAdapter } from "../adapters/index.js";
import type { ParsedCli } from "../cli/args.js";
import { describeConnection, resolveConnection } from "../core/connection.js";
import { selectModels } from "../core/model-selection.js";
import { buildListReport } from "../core/report.js";
import { discoverModels } from "../services/model-discovery.js";
import { printFetchError, printFetchRetry, printModels } from "../ui/terminal.js";

export async function runListCommand(options: Extract<ParsedCli, { command: "list" }>): Promise<number> {
  const startedAt = new Date();
  const connection = await resolveConnection(options.connection);
  const adapter = createAdapter(connection.config);
  const log = options.global.quiet || options.output.json ? () => undefined : (message: string) => console.error(message);
  const human = !options.output.json && !options.global.quiet;

  if (!options.global.quiet) {
    if (options.output.json) console.error("正在获取模型...");
    else if (human) console.log("\n正在获取模型...");
  }

  let models;
  try {
    models = await discoverModels(adapter, {
      onRetry: (event) => {
        if (options.output.json || options.global.quiet) {
          log(`重试获取模型：第 ${event.nextAttempt} 次，等待 ${event.delayMs} ms`);
          return;
        }
        printFetchRetry(event.nextAttempt, event.delayMs, event.error);
      },
    });
  } catch (error) {
    if (!options.output.json) printFetchError(error);
    else console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }

  const { selected, warnings } = selectModels(models, {
    filter: options.filter,
    exclude: options.exclude,
  });
  for (const warning of warnings) {
    console.error(chalk.yellow(warning));
  }

  const finishedAt = new Date();
  const report = buildListReport({
    startedAt,
    finishedAt,
    connection: describeConnection(connection),
    options: {
      filter: options.filter,
      exclude: options.exclude,
    },
    models: selected.map((model) => model.id),
  });

  if (options.output.outputPath) {
    await writeFile(options.output.outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  if (options.output.json) {
    console.log(JSON.stringify(report, null, 2));
  } else if (human) {
    if (selected.length === 0) {
      console.log("\n未找到匹配的模型。");
    } else {
      printModels(selected);
    }
    if (options.output.outputPath) {
      console.log(chalk.dim(`结果已写入：${options.output.outputPath}`));
    }
  }

  return 0;
}
