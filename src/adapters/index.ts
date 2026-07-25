import { AnthropicAdapter } from "./anthropic.js";
import { OllamaAdapter } from "./ollama.js";
import { OpenAiAdapter } from "./openai.js";
import type { ConnectionConfig, ModelApiAdapter } from "../types.js";

export function createAdapter(config: ConnectionConfig): ModelApiAdapter {
  switch (config.apiType) {
    case "openai":
      return new OpenAiAdapter(config);
    case "anthropic":
      return new AnthropicAdapter(config);
    case "ollama":
      return new OllamaAdapter(config);
  }
}
