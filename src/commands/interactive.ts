import { createAdapter } from "../adapters/index.js";
import { addConnection, getConfigPath, listConnections } from "../services/config-store.js";
import {
  chooseApiType,
  chooseModels,
  chooseProbeConcurrency,
  chooseStartMode,
  confirmAllModels,
  confirmSaveAfterProbe,
  readConnection,
  readConnectionName,
} from "../services/input.js";
import { discoverModels } from "../services/model-discovery.js";
import { probeModels } from "../services/probe-service.js";
import { runSavedFlow } from "../services/saved-flow.js";
import {
  printBanner,
  printConfigSaved,
  printEmptyModelList,
  printFetchError,
  printFetchRetry,
  printLatencyStats,
  printModels,
  printProbeResult,
  printProbeRetry,
  printProbeStart,
  printSummary,
  printUsableModels,
} from "../ui/terminal.js";

export async function runInteractiveCommand(): Promise<number> {
  printBanner();

  const mode = await chooseStartMode();
  if (mode === "saved") {
    await runSavedFlow();
    return process.exitCode === 1 ? 1 : 0;
  }

  await runFreshFlow();
  return process.exitCode === 1 ? 1 : 0;
}

async function runFreshFlow(): Promise<void> {
  const apiType = await chooseApiType();
  const connection = await readConnection();
  const adapter = createAdapter({ ...connection, apiType });

  console.log("\n正在获取模型...");
  let models;
  try {
    models = await discoverModels(adapter, {
      onRetry: (event) => printFetchRetry(event.nextAttempt, event.delayMs, event.error),
    });
  } catch (error) {
    printFetchError(error);
    process.exitCode = 1;
    return;
  }

  if (models.length === 0) {
    printEmptyModelList();
    return;
  }

  printModels(models);
  const probeAll = await confirmAllModels();
  const selectedModels = probeAll ? models : await chooseModels(models);

  const concurrency = await chooseProbeConcurrency();
  printProbeStart(selectedModels.length, concurrency);
  const results = await probeModels(adapter, selectedModels, printProbeResult, {
    concurrency,
    onRetry: (model, event) => printProbeRetry(model, event.nextAttempt, event.delayMs, event.error),
  });
  printSummary(results);
  printLatencyStats(results);
  printUsableModels(results);

  if (await confirmSaveAfterProbe()) {
    const existing = await listConnections();
    const name = await readConnectionName(existing.map((item) => item.name));
    const saved = await addConnection({
      name,
      apiType,
      baseUrl: connection.baseUrl,
      apiKey: connection.apiKey,
      models: selectedModels,
    });
    printConfigSaved(saved.name, getConfigPath());
  }
}
