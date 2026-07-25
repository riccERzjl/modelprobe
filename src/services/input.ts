import { checkbox, confirm, password, select, input } from "@inquirer/prompts";
import type {
  ApiType,
  ConnectionConfig,
  ModelInfo,
  ModelSourceChoice,
  SavedConnection,
  SavedMenuAction,
  StartMode,
} from "../types.js";
import { maskApiKey } from "./config-store.js";

export async function chooseStartMode(): Promise<StartMode> {
  return select<StartMode>({
    message: "请选择启动方式：",
    choices: [
      { name: "使用保存的信息进行探测", value: "saved" },
      { name: "从头开始输入信息进行探测", value: "fresh" },
    ],
  });
}

export async function chooseSavedMenuAction(): Promise<SavedMenuAction> {
  return select<SavedMenuAction>({
    message: "请选择操作：",
    choices: [
      { name: "选择保存的信息", value: "select" },
      { name: "新增信息", value: "add" },
      { name: "修改现有信息", value: "edit" },
      { name: "删除信息", value: "delete" },
      { name: "返回上一级", value: "back" },
    ],
  });
}

export async function chooseSavedConnection(
  connections: SavedConnection[],
  message = "请选择一条配置：",
): Promise<SavedConnection> {
  const id = await select<string>({
    message,
    choices: connections.map((connection) => ({
      name: formatConnectionChoice(connection),
      value: connection.id,
    })),
    pageSize: 12,
  });

  const selected = connections.find((connection) => connection.id === id);
  if (!selected) {
    throw new Error("未找到所选配置。");
  }
  return selected;
}

export async function chooseConnectionsToDelete(connections: SavedConnection[]): Promise<SavedConnection[]> {
  const selectedIds = await checkbox<string>({
    message: "选择要删除的配置（空格切换，a 全选，回车确认）：",
    choices: connections.map((connection) => ({
      name: formatConnectionChoice(connection),
      value: connection.id,
    })),
    required: true,
    pageSize: 12,
  });

  const selected = new Set(selectedIds);
  return connections.filter((connection) => selected.has(connection.id));
}

export async function readConnectionName(existingNames: string[] = [], initial?: string): Promise<string> {
  const normalizedExisting = new Set(existingNames.map((name) => name.trim().toLowerCase()));
  if (initial) {
    normalizedExisting.delete(initial.trim().toLowerCase());
  }

  return input({
    message: "配置名称：",
    default: initial,
    validate: (value) => {
      const name = value.trim();
      if (!name) return "配置名称不能为空。";
      if (normalizedExisting.has(name.toLowerCase())) return `配置名称「${name}」已存在，请换一个名称。`;
      return true;
    },
  }).then((value) => value.trim());
}

export async function readConnection(defaults?: {
  baseUrl?: string;
  apiKey?: string;
}): Promise<Omit<ConnectionConfig, "apiType">> {
  const baseUrl = await input({
    message: "Base URL:",
    default: defaults?.baseUrl,
    validate: (value) => {
      if (!value.trim()) return "Base URL 不能为空。";
      try {
        const url = new URL(value.trim());
        if (!/^https?:$/.test(url.protocol)) return "仅支持 http:// 或 https:// URL。";
        return true;
      } catch {
        return "请输入合法的 HTTP URL。";
      }
    },
  });

  const hasExistingKey = typeof defaults?.apiKey === "string";
  const apiKey = await password({
    message: hasExistingKey
      ? `API Key（直接回车保留原值 ${maskApiKey(defaults.apiKey ?? "")}）：`
      : "API Key（Ollama 未启用鉴权时可直接回车）：",
    mask: "*",
  });

  return {
    baseUrl: baseUrl.trim(),
    apiKey: apiKey.length > 0 ? apiKey : (defaults?.apiKey ?? ""),
  };
}

export async function chooseApiType(defaultValue?: ApiType): Promise<ApiType> {
  return select<ApiType>({
    message: "请选择模型接口类型：",
    default: defaultValue,
    choices: [
      { name: "OpenAI-compatible", value: "openai" },
      { name: "Anthropic-compatible", value: "anthropic" },
      { name: "Ollama-compatible", value: "ollama" },
    ],
  });
}

export async function confirmAllModels(): Promise<boolean> {
  return confirm({ message: "是否探测全部模型？", default: true });
}

export async function chooseModels(models: ModelInfo[]): Promise<ModelInfo[]> {
  const selectedIds = await checkbox<string>({
    message: "选择要探测的模型（空格切换，a 全选，回车确认）：",
    choices: models.map((model) => ({ name: model.id, value: model.id })),
    required: true,
    pageSize: 15,
  });

  const selected = new Set(selectedIds);
  return models.filter((model) => selected.has(model.id));
}

export async function chooseModelSource(savedModelCount: number): Promise<ModelSourceChoice> {
  return select<ModelSourceChoice>({
    message: "请选择模型来源：",
    choices: [
      {
        name: `使用保存的模型（${savedModelCount} 个）`,
        value: "saved",
        disabled: savedModelCount === 0 ? "当前配置未保存任何模型" : false,
      },
      { name: "重新选择模型进行探测", value: "reselect" },
    ],
  });
}

export async function confirmProbeNow(): Promise<boolean> {
  return confirm({ message: "是否立即使用该配置进行探测？", default: true });
}

export async function confirmSaveAfterProbe(): Promise<boolean> {
  return confirm({ message: "是否将本次连接信息保存为配置？", default: false });
}

export async function confirmUpdateSavedModels(): Promise<boolean> {
  return confirm({ message: "是否将本次选择的模型写回该配置？", default: true });
}

export async function confirmDeleteConnections(count: number): Promise<boolean> {
  return confirm({
    message: `确认删除选中的 ${count} 条配置？此操作不可恢复。`,
    default: false,
  });
}

export async function confirmReselectModelsOnEdit(): Promise<boolean> {
  return confirm({ message: "是否重新拉取并选择模型列表？", default: false });
}

function formatConnectionChoice(connection: SavedConnection): string {
  const key = maskApiKey(connection.apiKey);
  return `${connection.name}  [${connection.apiType}]  ${connection.baseUrl}  key:${key}  模型:${connection.models.length}`;
}
