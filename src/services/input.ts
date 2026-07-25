import { checkbox, confirm, password, select, input } from "@inquirer/prompts";
import type { ApiType, ConnectionConfig, ModelInfo } from "../types.js";

export async function readConnection(): Promise<Omit<ConnectionConfig, "apiType">> {
  const baseUrl = await input({
    message: "Base URL:",
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

  const apiKey = await password({
    message: "API Key（Ollama 未启用鉴权时可直接回车）：",
    mask: "*",
  });

  return { baseUrl: baseUrl.trim(), apiKey };
}

export async function chooseApiType(): Promise<ApiType> {
  return select<ApiType>({
    message: "请选择模型接口类型：",
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
