import type { ConnectionConfig } from "../types.js";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly url?: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export function authorizationHeaders(apiKey: string): HeadersInit {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

export async function requestJson<T>(
  url: string,
  init: RequestInit,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    const reason = error instanceof Error ? error.message : String(error);
    throw new ApiRequestError(`网络请求失败：${reason}`, undefined, url);
  }

  const text = await response.text();
  let body: unknown = undefined;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      if (!response.ok) {
        throw new ApiRequestError(`HTTP ${response.status} ${response.statusText}：${text.slice(0, 500)}`, response.status, url);
      }
      throw new ApiRequestError(`响应不是有效 JSON：${text.slice(0, 500)}`, response.status, url);
    }
  }

  if (!response.ok) {
    throw new ApiRequestError(formatApiError(response, body), response.status, url);
  }

  return body as T;
}

function formatApiError(response: Response, body: unknown): string {
  const message = findErrorMessage(body);
  const suffix = message ? `：${message}` : "";
  return `HTTP ${response.status} ${response.statusText}${suffix}`;
}

function findErrorMessage(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const record = body as Record<string, unknown>;
  const error = record.error;

  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const errorRecord = error as Record<string, unknown>;
    if (typeof errorRecord.message === "string") return errorRecord.message;
    if (typeof errorRecord.error === "string") return errorRecord.error;
  }

  if (typeof record.message === "string") return record.message;
  return undefined;
}

export function getConfig(config: ConnectionConfig): ConnectionConfig {
  return config;
}
