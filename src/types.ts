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
  /** Number of HTTP attempts, including the initial request. */
  attempts?: number;
  content?: string;
  error?: string;
}

export interface ModelApiAdapter {
  listModels(signal?: AbortSignal): Promise<ModelInfo[]>;
  probe(model: ModelInfo, signal: AbortSignal): Promise<ProbeSuccess>;
}

export type StartMode = "saved" | "fresh";

export type SavedMenuAction = "select" | "add" | "edit" | "delete" | "back";

export type ModelSourceChoice = "saved" | "reselect";

export interface SavedConnection {
  id: string;
  name: string;
  apiType: ApiType;
  baseUrl: string;
  apiKey: string;
  models: ModelInfo[];
  createdAt: string;
  updatedAt: string;
}

export interface ConfigStore {
  version: 1;
  connections: SavedConnection[];
}
