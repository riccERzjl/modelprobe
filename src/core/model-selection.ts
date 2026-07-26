import type { ModelInfo } from "../types.js";

export interface ModelSelectionInput {
  filter?: string;
  exclude?: string;
  /** Explicit allow-list of model IDs. Applied after filter/exclude. */
  models?: string[];
  strict?: boolean;
}

export interface ModelSelectionResult {
  selected: ModelInfo[];
  warnings: string[];
}

export class ModelSelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelSelectionError";
  }
}

/**
 * Filter a model list by optional regex include/exclude and an explicit ID allow-list.
 */
export function selectModels(all: ModelInfo[], input: ModelSelectionInput = {}): ModelSelectionResult {
  const warnings: string[] = [];
  const filter = compileRegex(input.filter, "--filter");
  const exclude = compileRegex(input.exclude, "--exclude");

  let selected = all;
  if (filter) {
    selected = selected.filter((model) => filter.test(model.id));
  }
  if (exclude) {
    selected = selected.filter((model) => !exclude.test(model.id));
  }

  if (input.models && input.models.length > 0) {
    const available = new Map(selected.map((model) => [model.id, model]));
    // Also allow exact match against the pre-filter universe when user names IDs directly?
    // Spec: intersection with post-filter set; missing IDs warn or strict-fail.
    const availableAll = new Map(all.map((model) => [model.id, model]));
    const next: ModelInfo[] = [];
    const seen = new Set<string>();

    for (const id of input.models) {
      if (seen.has(id)) continue;
      seen.add(id);

      const inFiltered = available.get(id);
      if (inFiltered) {
        next.push(inFiltered);
        continue;
      }

      if (availableAll.has(id)) {
        const message = `模型「${id}」存在但被 --filter/--exclude 排除。`;
        if (input.strict) throw new ModelSelectionError(message);
        warnings.push(message);
        continue;
      }

      const message = `模型「${id}」不在可用列表中，已跳过。`;
      if (input.strict) throw new ModelSelectionError(`模型「${id}」不在可用列表中。`);
      warnings.push(message);
    }
    selected = next;
  }

  // Empty results are returned to the caller. Probe commands treat them as a
  // runtime failure; list commands may legitimately show an empty set.
  if (selected.length === 0 && input.strict) {
    throw new ModelSelectionError("过滤后没有可探测的模型。");
  }

  return { selected, warnings };
}

function compileRegex(pattern: string | undefined, flagName: string): RegExp | undefined {
  if (!pattern) return undefined;
  if (pattern.length > 200) {
    throw new ModelSelectionError(`${flagName} 正则过长（最多 200 字符）。`);
  }
  try {
    return new RegExp(pattern, "i");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new ModelSelectionError(`${flagName} 不是合法正则：${reason}`);
  }
}
