import { listConnections } from "../services/config-store.js";
import { resolveEnvApiKey, type ConnectionOptions } from "../cli/args.js";
import type { ApiType, ConnectionConfig, SavedConnection } from "../types.js";

export class ConnectionResolveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectionResolveError";
  }
}

export interface ResolvedConnection {
  config: ConnectionConfig;
  source: "config" | "cli";
  name?: string;
  saved?: SavedConnection;
}

/**
 * Resolve CLI connection flags + optional saved config into a concrete ConnectionConfig.
 * Precedence: CLI flags > saved config > environment variables.
 */
export async function resolveConnection(options: ConnectionOptions): Promise<ResolvedConnection> {
  if (options.configName) {
    const saved = await findSavedConnection(options.configName);
    const apiType = options.apiType ?? saved.apiType;
    const baseUrl = options.baseUrl ?? saved.baseUrl;
    let apiKey: string;
    if (options.apiKeyFromFlag) {
      apiKey = options.apiKey;
    } else {
      apiKey = saved.apiKey || resolveEnvApiKey(apiType);
    }
    return {
      config: { apiType, baseUrl, apiKey },
      source: "config",
      name: saved.name,
      saved,
    };
  }

  if (!options.apiType || !options.baseUrl) {
    throw new ConnectionResolveError("缺少协议类型或 Base URL。");
  }

  return {
    config: {
      apiType: options.apiType,
      baseUrl: options.baseUrl,
      apiKey: options.apiKey,
    },
    source: "cli",
  };
}

export async function findSavedConnection(name: string): Promise<SavedConnection> {
  const connections = await listConnections();
  const normalized = name.trim().toLowerCase();
  const matched = connections.find((item) => item.name.trim().toLowerCase() === normalized);
  if (!matched) {
    const available = connections.length > 0 ? connections.map((item) => item.name).join(", ") : "（无）";
    throw new ConnectionResolveError(`未找到名为「${name}」的配置。可用配置：${available}`);
  }
  return matched;
}

export function describeConnection(connection: ResolvedConnection): {
  source: "config" | "cli";
  name?: string;
  apiType: ApiType;
  baseUrl: string;
} {
  return {
    source: connection.source,
    name: connection.name,
    apiType: connection.config.apiType,
    baseUrl: connection.config.baseUrl,
  };
}
