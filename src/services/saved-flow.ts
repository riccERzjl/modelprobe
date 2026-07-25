import { createAdapter } from "../adapters/index.js";
import type { ConnectionConfig, ModelInfo, SavedConnection } from "../types.js";
import {
  printConfigDeleted,
  printConfigSaved,
  printConfigUpdated,
  printEmptyModelList,
  printFetchError,
  printModels,
  printNoSavedConnections,
  printProbeResult,
  printProbeStart,
  printSavedConnectionDetail,
  printSavedConnections,
  printSummary,
  printUsableModels,
  printUsingSavedModels,
} from "../ui/terminal.js";
import {
  addConnection,
  getConfigPath,
  listConnections,
  removeConnections,
  updateConnection,
} from "./config-store.js";
import {
  chooseApiType,
  chooseConnectionsToDelete,
  chooseModelSource,
  chooseModels,
  chooseSavedConnection,
  chooseSavedMenuAction,
  confirmAllModels,
  confirmDeleteConnections,
  confirmProbeNow,
  confirmReselectModelsOnEdit,
  confirmUpdateSavedModels,
  readConnection,
  readConnectionName,
} from "./input.js";
import { probeModels } from "./probe-service.js";

export async function runSavedFlow(): Promise<void> {
  while (true) {
    const connections = await listConnections();
    printSavedConnections(connections, getConfigPath());

    const action = await chooseSavedMenuAction();
    switch (action) {
      case "select":
        if (connections.length === 0) {
          printNoSavedConnections();
          break;
        }
        await handleSelect(connections);
        return;
      case "add":
        await handleAdd(connections);
        break;
      case "edit":
        await handleEdit(connections);
        break;
      case "delete":
        await handleDelete(connections);
        break;
      case "back":
        return;
    }
  }
}

async function handleSelect(connections: SavedConnection[]): Promise<void> {
  const selected = await chooseSavedConnection(connections);
  printSavedConnectionDetail(selected);

  let modelsToProbe: ModelInfo[];
  const source = await chooseModelSource(selected.models.length);

  if (source === "saved") {
    if (selected.models.length === 0) {
      console.log("\n当前配置未保存模型，将重新选择模型。");
      const reselected = await fetchAndChooseModels(toConnectionConfig(selected));
      if (!reselected) return;
      modelsToProbe = reselected;
      if (await confirmUpdateSavedModels()) {
        await updateConnection(selected.id, { models: modelsToProbe });
        printConfigUpdated(selected.name);
      }
    } else {
      printUsingSavedModels(selected.models.length);
      modelsToProbe = selected.models;
    }
  } else {
    const reselected = await fetchAndChooseModels(toConnectionConfig(selected));
    if (!reselected) return;
    modelsToProbe = reselected;
    if (await confirmUpdateSavedModels()) {
      await updateConnection(selected.id, { models: modelsToProbe });
      printConfigUpdated(selected.name);
    }
  }

  await runProbe(toConnectionConfig(selected), modelsToProbe);
}

async function handleAdd(connections: SavedConnection[]): Promise<void> {
  const name = await readConnectionName(connections.map((item) => item.name));
  const apiType = await chooseApiType();
  const connection = await readConnection();
  const config: ConnectionConfig = { ...connection, apiType };

  const models = await fetchAndChooseModels(config);
  if (!models) return;

  const saved = await addConnection({
    name,
    apiType,
    baseUrl: connection.baseUrl,
    apiKey: connection.apiKey,
    models,
  });
  printConfigSaved(saved.name, getConfigPath());

  if (await confirmProbeNow()) {
    await runProbe(config, models);
  }
}

async function handleEdit(connections: SavedConnection[]): Promise<void> {
  if (connections.length === 0) {
    printNoSavedConnections();
    return;
  }

  const selected = await chooseSavedConnection(connections, "请选择要修改的配置：");
  printSavedConnectionDetail(selected);

  const name = await readConnectionName(
    connections.map((item) => item.name),
    selected.name,
  );
  const apiType = await chooseApiType(selected.apiType);
  const connection = await readConnection({
    baseUrl: selected.baseUrl,
    apiKey: selected.apiKey,
  });

  let models = selected.models;
  if (await confirmReselectModelsOnEdit()) {
    const reselected = await fetchAndChooseModels({ ...connection, apiType });
    if (!reselected) return;
    models = reselected;
  }

  const updated = await updateConnection(selected.id, {
    name,
    apiType,
    baseUrl: connection.baseUrl,
    apiKey: connection.apiKey,
    models,
  });
  printConfigUpdated(updated.name);

  if (await confirmProbeNow()) {
    const config = { ...connection, apiType };
    let modelsToProbe = models;
    if (modelsToProbe.length === 0) {
      const reselected = await fetchAndChooseModels(config);
      if (!reselected) return;
      modelsToProbe = reselected;
    }
    await runProbe(config, modelsToProbe);
  }
}

async function handleDelete(connections: SavedConnection[]): Promise<void> {
  if (connections.length === 0) {
    printNoSavedConnections();
    return;
  }

  const selected = await chooseConnectionsToDelete(connections);
  if (!(await confirmDeleteConnections(selected.length))) {
    console.log("\n已取消删除。");
    return;
  }

  const removed = await removeConnections(selected.map((item) => item.id));
  printConfigDeleted(removed);
}

async function fetchAndChooseModels(config: ConnectionConfig): Promise<ModelInfo[] | null> {
  const models = await listRemoteModels(config);
  if (models === null) return null;
  if (models.length === 0) {
    printEmptyModelList();
    return null;
  }

  printModels(models);
  const probeAll = await confirmAllModels();
  return probeAll ? models : await chooseModels(models);
}

async function listRemoteModels(config: ConnectionConfig): Promise<ModelInfo[] | null> {
  const adapter = createAdapter(config);
  console.log("\n正在获取模型...");
  try {
    return await adapter.listModels();
  } catch (error) {
    printFetchError(error);
    process.exitCode = 1;
    return null;
  }
}

async function runProbe(config: ConnectionConfig, models: ModelInfo[]): Promise<void> {
  if (models.length === 0) {
    printEmptyModelList();
    return;
  }

  const adapter = createAdapter(config);
  printProbeStart(models.length);
  const results = await probeModels(adapter, models, printProbeResult);
  printSummary(results);
  printUsableModels(results);
}

function toConnectionConfig(connection: SavedConnection): ConnectionConfig {
  return {
    apiType: connection.apiType,
    baseUrl: connection.baseUrl,
    apiKey: connection.apiKey,
  };
}
