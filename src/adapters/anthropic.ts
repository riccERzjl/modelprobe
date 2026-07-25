import { requestJson } from "./base.js";
import { createEndpoint } from "../services/url.js";
import type { ConnectionConfig, ModelApiAdapter, ModelInfo, ProbeSuccess } from "../types.js";

interface AnthropicModelsResponse {
  data?: Array<{ id?: unknown; created_at?: unknown }>;
}

interface AnthropicMessageResponse {
  content?: Array<{ type?: unknown; text?: unknown }>;
}

export class AnthropicAdapter implements ModelApiAdapter {
  constructor(private readonly config: ConnectionConfig) {}

  async listModels(): Promise<ModelInfo[]> {
    const url = createEndpoint(this.config.baseUrl, "models", "v1");
    const response = await requestJson<AnthropicModelsResponse>(url, {
      headers: this.headers(),
    });

    if (!Array.isArray(response.data)) throw new Error("响应格式不符合 Anthropic models API：缺少 data 数组。");
    return response.data
      .filter((model): model is { id: string; created_at?: unknown } => typeof model.id === "string" && model.id.length > 0)
      .map((model) => ({ id: model.id }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async probe(model: ModelInfo, signal: AbortSignal): Promise<ProbeSuccess> {
    const url = createEndpoint(this.config.baseUrl, "messages", "v1");
    const response = await requestJson<AnthropicMessageResponse>(url, {
      method: "POST",
      headers: {
        ...this.headers(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model.id,
        max_tokens: 32,
        messages: [{ role: "user", content: "hi" }],
      }),
    }, signal);

    const content = response.content
      ?.filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text as string)
      .join("\n");
    if (!content?.trim()) {
      throw new Error("响应格式不符合 Anthropic messages API：未找到非空 text 内容块。");
    }
    return { content };
  }

  private headers(): HeadersInit {
    return {
      "anthropic-version": "2023-06-01",
      ...(this.config.apiKey ? { "x-api-key": this.config.apiKey } : {}),
    };
  }
}
