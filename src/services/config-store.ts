import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { ApiType, ConfigStore, ModelInfo, SavedConnection } from "../types.js";

const STORE_VERSION = 1 as const;
const CONFIG_DIR = join(homedir(), ".modelprobe");
const CONFIG_FILE = join(CONFIG_DIR, "connections.json");

export function getConfigPath(): string {
  return CONFIG_FILE;
}

export async function loadStore(): Promise<ConfigStore> {
  try {
    const raw = await readFile(CONFIG_FILE, "utf8");
    return parseStore(raw);
  } catch (error) {
    if (isNotFoundError(error)) {
      return emptyStore();
    }
    throw error;
  }
}

export async function saveStore(store: ConfigStore): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  const payload = `${JSON.stringify(store, null, 2)}\n`;
  const tempFile = `${CONFIG_FILE}.${process.pid}.tmp`;
  await writeFile(tempFile, payload, "utf8");
  try {
    await chmod(tempFile, 0o600);
  } catch {
    // Best-effort; some platforms may not support chmod the same way.
  }
  await rename(tempFile, CONFIG_FILE);
  try {
    await chmod(CONFIG_FILE, 0o600);
  } catch {
    // Best-effort.
  }
}

export async function listConnections(): Promise<SavedConnection[]> {
  const store = await loadStore();
  return [...store.connections].sort((a, b) => a.name.localeCompare(b.name));
}

export async function addConnection(input: {
  name: string;
  apiType: ApiType;
  baseUrl: string;
  apiKey: string;
  models: ModelInfo[];
}): Promise<SavedConnection> {
  const store = await loadStore();
  const now = new Date().toISOString();
  const connection: SavedConnection = {
    id: randomUUID(),
    name: input.name.trim(),
    apiType: input.apiType,
    baseUrl: input.baseUrl.trim(),
    apiKey: input.apiKey,
    models: cloneModels(input.models),
    createdAt: now,
    updatedAt: now,
  };

  assertUniqueName(store, connection.name);
  store.connections.push(connection);
  await saveStore(store);
  return connection;
}

export async function updateConnection(
  id: string,
  patch: Partial<Pick<SavedConnection, "name" | "apiType" | "baseUrl" | "apiKey" | "models">>,
): Promise<SavedConnection> {
  const store = await loadStore();
  const index = store.connections.findIndex((item) => item.id === id);
  if (index < 0) {
    throw new Error("未找到要修改的配置。");
  }

  const current = store.connections[index];
  const nextName = patch.name?.trim() ?? current.name;
  if (nextName !== current.name) {
    assertUniqueName(store, nextName, id);
  }

  const updated: SavedConnection = {
    ...current,
    name: nextName,
    apiType: patch.apiType ?? current.apiType,
    baseUrl: patch.baseUrl?.trim() ?? current.baseUrl,
    apiKey: patch.apiKey ?? current.apiKey,
    models: patch.models ? cloneModels(patch.models) : current.models,
    updatedAt: new Date().toISOString(),
  };

  store.connections[index] = updated;
  await saveStore(store);
  return updated;
}

export async function removeConnections(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const store = await loadStore();
  const removeSet = new Set(ids);
  const before = store.connections.length;
  store.connections = store.connections.filter((item) => !removeSet.has(item.id));
  const removed = before - store.connections.length;
  if (removed > 0) {
    await saveStore(store);
  }
  return removed;
}

export function maskApiKey(apiKey: string): string {
  const value = apiKey.trim();
  if (!value) return "(空)";
  if (value.length <= 8) return "*".repeat(value.length);
  return `${value.slice(0, 3)}***${value.slice(-4)}`;
}

function emptyStore(): ConfigStore {
  return { version: STORE_VERSION, connections: [] };
}

function parseStore(raw: string): ConfigStore {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`配置文件不是有效 JSON：${CONFIG_FILE}`);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error(`配置文件格式无效：${CONFIG_FILE}`);
  }

  const record = parsed as Record<string, unknown>;
  if (record.version !== STORE_VERSION) {
    throw new Error(`不支持的配置文件版本（期望 ${STORE_VERSION}）：${CONFIG_FILE}`);
  }
  if (!Array.isArray(record.connections)) {
    throw new Error(`配置文件缺少 connections 数组：${CONFIG_FILE}`);
  }

  const connections = record.connections.map((item, index) => parseConnection(item, index));
  return { version: STORE_VERSION, connections };
}

function parseConnection(value: unknown, index: number): SavedConnection {
  if (!value || typeof value !== "object") {
    throw new Error(`配置项 #${index + 1} 格式无效：${CONFIG_FILE}`);
  }

  const record = value as Record<string, unknown>;
  const id = asNonEmptyString(record.id, `配置项 #${index + 1} 缺少 id`);
  const name = asNonEmptyString(record.name, `配置项 #${index + 1} 缺少 name`);
  const apiType = asApiType(record.apiType, `配置项 #${index + 1} 的 apiType 无效`);
  const baseUrl = asNonEmptyString(record.baseUrl, `配置项 #${index + 1} 缺少 baseUrl`);
  const apiKey = typeof record.apiKey === "string" ? record.apiKey : "";
  const createdAt = asNonEmptyString(record.createdAt, `配置项 #${index + 1} 缺少 createdAt`);
  const updatedAt = asNonEmptyString(record.updatedAt, `配置项 #${index + 1} 缺少 updatedAt`);
  const models = Array.isArray(record.models)
    ? record.models
        .filter((model): model is { id: string } => {
          return !!model && typeof model === "object" && typeof (model as { id?: unknown }).id === "string";
        })
        .map((model) => ({ id: model.id }))
    : [];

  return { id, name, apiType, baseUrl, apiKey, models, createdAt, updatedAt };
}

function asNonEmptyString(value: unknown, message: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${message}：${CONFIG_FILE}`);
  }
  return value.trim();
}

function asApiType(value: unknown, message: string): ApiType {
  if (value === "openai" || value === "anthropic" || value === "ollama") {
    return value;
  }
  throw new Error(`${message}：${CONFIG_FILE}`);
}

function assertUniqueName(store: ConfigStore, name: string, excludeId?: string): void {
  const normalized = name.trim().toLowerCase();
  const exists = store.connections.some(
    (item) => item.id !== excludeId && item.name.trim().toLowerCase() === normalized,
  );
  if (exists) {
    throw new Error(`配置名称「${name.trim()}」已存在，请换一个名称。`);
  }
}

function cloneModels(models: ModelInfo[]): ModelInfo[] {
  return models.map((model) => ({ id: model.id }));
}

function isNotFoundError(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "ENOENT";
}
