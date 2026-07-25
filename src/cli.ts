#!/usr/bin/env node

import { createAdapter } from "./adapters/index.js";
import { chooseApiType, chooseModels, confirmAllModels, readConnection } from "./services/input.js";
import { probeModels } from "./services/probe-service.js";
import { printBanner, printFetchError, printModels, printProbeResult, printProbeStart, printSummary, printUsableModels } from "./ui/terminal.js";

async function main(): Promise<void> {
  printBanner();

  const apiType = await chooseApiType();
  const connection = await readConnection();
  const adapter = createAdapter({ ...connection, apiType });

  console.log("\n正在获取模型...");
  let models;
  try {
    models = await adapter.listModels();
  } catch (error) {
    printFetchError(error);
    process.exitCode = 1;
    return;
  }

  if (models.length === 0) {
    console.log("\n获取成功，但接口未返回任何模型，因此无法进行探测。");
    return;
  }

  printModels(models);
  const probeAll = await confirmAllModels();
  const selectedModels = probeAll ? models : await chooseModels(models);

  printProbeStart(selectedModels.length);
  const results = await probeModels(adapter, selectedModels, printProbeResult);
  printSummary(results);
  printUsableModels(results);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\n程序异常退出：${message}`);
  process.exitCode = 1;
});
