import { authorizationHeaders, requestJson } from "./base.js";
import { createEndpoint } from "../services/url.js";
import type { ConnectionConfig, ModelApiAdapter, ModelInfo, ProbeSuccess } from "../types.js";

interface OllamaTagsResponse {
  models?: Array<{ name?: unknown; modified_at?: unknown }>;
}

interface OllamaChatResponse {
  message?: { content?: unknown };
}

export class OllamaAdapter implements ModelApiAdapter {
  constructor(private readonly config: ConnectionConfig) {}

  async listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    const url = createEndpoint(this.config.baseUrl, "api/tags");
    const response = await requestJson<OllamaTagsResponse>(url, {
      headers: authorizationHeaders(this.config.apiKey),
    }, signal);

    if (!Array.isArray(response.models)) throw new Error("响应格式不符合 Ollama tags API：缺少 models 数组。");
    return response.models
      .filter((model): model is { name: string } => typeof model.name === "string" && model.name.length > 0)
      .map((model) => ({ id: model.name }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async probe(model: ModelInfo, signal: AbortSignal): Promise<ProbeSuccess> {
    const url = createEndpoint(this.config.baseUrl, "api/chat");
    const response = await requestJson<OllamaChatResponse>(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authorizationHeaders(this.config.apiKey),
      },
      body: JSON.stringify({
        model: model.id,
        messages: [{ role: "user", content: "hi" }],
        stream: false,
      }),
    }, signal);

    const content = response.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new Error("响应格式不符合 Ollama chat API：未找到非空 message.content。");
    }
    return { content };
  }
}
