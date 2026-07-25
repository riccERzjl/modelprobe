function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

/**
 * Build a protocol endpoint. For native Ollama endpoints, a trailing /v1 is
 * removed because Ollama serves its API directly under /api.
 */
export function createEndpoint(baseUrl: string, endpoint: string, apiVersion?: string): string {
  let base = trimTrailingSlashes(baseUrl.trim());
  const normalizedEndpoint = endpoint.replace(/^\/+/, "");

  if (!apiVersion) {
    if (normalizedEndpoint.startsWith("api/")) base = base.replace(/\/v1$/i, "");
    return `${base}/${normalizedEndpoint}`;
  }

  const version = apiVersion.replace(/^\/+|\/+$/g, "");
  const baseHasVersion = new RegExp(`/${escapeRegExp(version)}$`, "i").test(base);
  return `${base}${baseHasVersion ? "" : `/${version}`}/${normalizedEndpoint}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
