import { authorizationHeaders, requestJson } from "./base.js";
import { createEndpoint } from "../services/url.js";
import type { ConnectionConfig, ModelApiAdapter, ModelInfo, ProbeSuccess } from "../types.js";

interface OpenAiModelsResponse {
  data?: Array<{ id?: unknown; created?: unknown; owned_by?: unknown }>;
}

interface OpenAiChatResponse {
  choices?: Array<{ message?: { content?: unknown } }>;
}

export class OpenAiAdapter implements ModelApiAdapter {
  constructor(private readonly config: ConnectionConfig) {}

  async listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    const url = createEndpoint(this.config.baseUrl, "models", "v1");
    const response = await requestJson<OpenAiModelsResponse>(url, {
      headers: authorizationHeaders(this.config.apiKey),
    }, signal);

    if (!Array.isArray(response.data)) throw new Error("响应格式不符合 OpenAI models API：缺少 data 数组。");
    return response.data
      .filter((model): model is { id: string; created?: unknown; owned_by?: unknown } => typeof model.id === "string" && model.id.length > 0)
      .map((model) => ({
        id: model.id,
        created: typeof model.created === "number" ? model.created : undefined,
        ownedBy: typeof model.owned_by === "string" ? model.owned_by : undefined,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async probe(model: ModelInfo, signal: AbortSignal): Promise<ProbeSuccess> {
    const url = createEndpoint(this.config.baseUrl, "chat/completions", "v1");
    const response = await requestJson<OpenAiChatResponse>(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authorizationHeaders(this.config.apiKey),
      },
      body: JSON.stringify({
        model: model.id,
        messages: [{ role: "user", content: "hi" }],
        stream: false,
        max_tokens: 32,
      }),
    }, signal);

    const content = response.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new Error("响应格式不符合 OpenAI chat completion API：未找到非空 choices[0].message.content。");
    }
    return { content };
  }
}
