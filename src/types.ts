export type ApiType = "openai" | "anthropic" | "ollama";

export interface ConnectionConfig {
  baseUrl: string;
  apiKey: string;
  apiType: ApiType;
}

export interface ModelInfo {
  id: string;
  created?: number;
  ownedBy?: string;
}

export interface ProbeSuccess {
  content: string;
}

export type ProbeStatus = "pending" | "running" | "success" | "failed" | "timeout";

export interface ProbeResult {
  model: ModelInfo;
  status: ProbeStatus;
  durationMs?: number;
  content?: string;
  error?: string;
}

export interface ModelApiAdapter {
  listModels(): Promise<ModelInfo[]>;
  probe(model: ModelInfo, signal: AbortSignal): Promise<ProbeSuccess>;
}
