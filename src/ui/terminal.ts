import chalk from "chalk";
import { maskApiKey } from "../services/config-store.js";
import type { ModelInfo, ProbeResult, SavedConnection } from "../types.js";

const STATUS_WIDTH = 6;
const DURATION_WIDTH = 10;
const SEPARATOR = " │ ";
const TABLE_OVERHEAD = STATUS_WIDTH + DURATION_WIDTH + SEPARATOR.length * 3;
const DEFAULT_TERMINAL_WIDTH = 100;
const MIN_TABLE_WIDTH = 60;
const MIN_MODEL_WIDTH = 14;
const MAX_MODEL_WIDTH = 36;
const MIN_DETAIL_WIDTH = 16;

interface TableLayout {
  totalWidth: number;
  modelWidth: number;
  detailWidth: number;
}

export function printBanner(): void {
  console.log(chalk.bold.cyan("\nModelProbe") + chalk.dim(" — 模型连通性探测工具\n"));
}

export function printModels(models: ModelInfo[]): void {
  console.log(chalk.green(`\n成功获取 ${models.length} 个模型：\n`));
  models.forEach((model, index) => console.log(`  ${chalk.dim(String(index + 1).padStart(3, " "))}. ${model.id}`));
  console.log();
}

export function printFetchError(error: unknown): void {
  console.error(chalk.red.bold("\n获取模型失败。"));
  console.error(chalk.red(formatError(error)));
}

export function printFetchRetry(attempt: number, delayMs: number, error: unknown): void {
  const seconds = formatRetryDelay(delayMs);
  console.log(chalk.yellow(`↻ 获取模型列表：${formatError(error)}，${seconds}后进行第 ${attempt} 次尝试……`));
}

export function printProbeStart(modelCount: number, concurrency: number): void {
  const layout = getTableLayout();
  console.log(
    chalk.cyan(
      `\n开始探测 ${modelCount} 个模型（最大并发 ${concurrency}，单模型最长等待 60 秒，失败最多重试 1 次）...\n`,
    ),
  );
  printTableHeader(layout);
}

export function printProbeRetry(model: ModelInfo, attempt: number, delayMs: number, error: unknown): void {
  const layout = getTableLayout();
  const detailLines = wrapText(
    `${formatError(error)}，${formatRetryDelay(delayMs)}后进行第 ${attempt} 次尝试……`,
    layout.detailWidth,
  );
  const firstLine = buildTableRow(
    chalk.yellow(column("[重试]", STATUS_WIDTH)),
    column(model.id, layout.modelWidth),
    chalk.dim(column("-", DURATION_WIDTH, "right")),
    chalk.yellow(detailLines[0] ?? ""),
  );
  const continuationPrefix = buildTableRow(
    " ".repeat(STATUS_WIDTH),
    " ".repeat(layout.modelWidth),
    " ".repeat(DURATION_WIDTH),
    "",
  );
  const continuationLines = detailLines.slice(1).map((line) => `${continuationPrefix}${chalk.yellow(line)}`);

  console.log([firstLine, ...continuationLines].join("\n"));
}

export function printProbeResult(result: ProbeResult): void {
  const layout = getTableLayout();
  const detail = getDetail(result);
  const detailLines = wrapText(detail.text, layout.detailWidth);
  const firstLine = buildTableRow(
    formatStatus(result.status),
    column(result.model.id, layout.modelWidth),
    chalk.dim(column(result.durationMs === undefined ? "-" : `${result.durationMs} ms`, DURATION_WIDTH, "right")),
    detailLines[0] ?? "",
  );
  const continuationPrefix = buildTableRow(
    " ".repeat(STATUS_WIDTH),
    " ".repeat(layout.modelWidth),
    " ".repeat(DURATION_WIDTH),
    "",
  );
  const continuationLines = detailLines.slice(1).map((line) => `${continuationPrefix}${line}`);

  console.log([firstLine, ...continuationLines].join("\n"));
}

export function printSummary(results: ProbeResult[]): void {
  const success = results.filter((result) => result.status === "success").length;
  const failed = results.filter((result) => result.status === "failed").length;
  const timeout = results.filter((result) => result.status === "timeout").length;
  console.log(`\n${chalk.dim(horizontalRule(getTableLayout()))}`);
  const totalAttempts = results.reduce((total, result) => total + (result.attempts ?? 1), 0);
  const retried = results.filter((result) => (result.attempts ?? 1) > 1).length;
  console.log(chalk.bold("探测完成：") + `共 ${results.length} 个；${chalk.green(`成功 ${success}`)}，${chalk.red(`失败 ${failed}`)}，${chalk.yellow(`超时 ${timeout}`)}。`);
  console.log(chalk.dim(`总请求尝试次数 ${totalAttempts}；发生重试的模型 ${retried} 个。`));
}

export function printUsableModels(results: ProbeResult[]): void {
  const usableModels = results.filter((result) => result.status === "success");
  console.log(`\n${chalk.bold.green("可用模型列表")}（${usableModels.length} 个）：`);

  if (usableModels.length === 0) {
    console.log(chalk.dim("  未发现可用模型。"));
    return;
  }

  usableModels.forEach((result, index) => {
    console.log(`  ${chalk.dim(String(index + 1).padStart(3, " "))}. ${result.model.id}`);
  });
}

export function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return String(error);
}

export function printSavedConnections(connections: SavedConnection[], configPath: string): void {
  console.log(chalk.cyan(`\n已保存配置（${connections.length} 条）`));
  console.log(chalk.dim(`存储位置：${configPath}\n`));

  if (connections.length === 0) {
    console.log(chalk.dim("  暂无保存的配置。"));
    return;
  }

  connections.forEach((connection, index) => {
    const prefix = chalk.dim(String(index + 1).padStart(3, " "));
    console.log(
      `  ${prefix}. ${chalk.bold(connection.name)}  ${chalk.dim(connection.apiType)}  ${connection.baseUrl}`,
    );
    console.log(
      `       key: ${maskApiKey(connection.apiKey)}  模型: ${connection.models.length} 个  更新: ${connection.updatedAt}`,
    );
  });
  console.log();
}

export function printSavedConnectionDetail(connection: SavedConnection): void {
  console.log(chalk.green(`\n已选择配置：${connection.name}`));
  console.log(`  协议：${connection.apiType}`);
  console.log(`  Base URL：${connection.baseUrl}`);
  console.log(`  API Key：${maskApiKey(connection.apiKey)}`);
  console.log(`  已保存模型：${connection.models.length} 个`);
  if (connection.models.length > 0) {
    connection.models.slice(0, 8).forEach((model, index) => {
      console.log(`    ${chalk.dim(String(index + 1).padStart(2, " "))}. ${model.id}`);
    });
    if (connection.models.length > 8) {
      console.log(chalk.dim(`    ... 另有 ${connection.models.length - 8} 个模型`));
    }
  }
  console.log();
}

export function printConfigSaved(name: string, configPath: string): void {
  console.log(chalk.green(`\n配置「${name}」已保存。`));
  console.log(chalk.dim(`存储位置：${configPath}`));
}

export function printConfigUpdated(name: string): void {
  console.log(chalk.green(`\n配置「${name}」已更新。`));
}

export function printConfigDeleted(count: number): void {
  console.log(chalk.green(`\n已删除 ${count} 条配置。`));
}

export function printNoSavedConnections(): void {
  console.log(chalk.yellow("\n暂无保存的配置，请先新增信息。"));
}

export function printEmptyModelList(): void {
  console.log("\n获取成功，但接口未返回任何模型，因此无法进行探测。");
}

export function printUsingSavedModels(count: number): void {
  console.log(chalk.cyan(`\n将使用保存的 ${count} 个模型进行探测。`));
}

function formatRetryDelay(delayMs: number): string {
  const seconds = (delayMs / 1_000).toFixed(delayMs < 1_000 ? 1 : 0);
  return `${seconds} 秒`;
}

function printTableHeader(layout: TableLayout): void {
  const rule = chalk.dim(horizontalRule(layout));
  const header = [
    column("状态", STATUS_WIDTH),
    column("模型", layout.modelWidth),
    column("耗时", DURATION_WIDTH, "right"),
    "详情",
  ].join(chalk.dim(SEPARATOR));
  console.log(rule);
  console.log(chalk.dim(header));
  console.log(rule);
}

function buildTableRow(status: string, model: string, duration: string, detail: string): string {
  return `${status}${SEPARATOR}${model}${SEPARATOR}${duration}${SEPARATOR}${detail}`;
}

function getDetail(result: ProbeResult): { text: string } {
  const attempts = result.attempts && result.attempts > 1 ? `（第 ${result.attempts} 次成功）` : "";
  const errorAttempts = result.attempts && result.attempts > 1 ? `（已尝试 ${result.attempts} 次）` : "";
  switch (result.status) {
    case "success":
      return { text: `${normalizeText(result.content) || "（响应无文本内容）"}${attempts}` };
    case "timeout":
      return { text: `${normalizeText(result.error) || "请求超过 60 秒"}${errorAttempts}` };
    case "failed":
      return { text: `${normalizeText(result.error) || "未知错误"}${errorAttempts}` };
    default:
      return { text: "" };
  }
}

function getTableLayout(): TableLayout {
  const terminalWidth = process.stdout.columns ?? DEFAULT_TERMINAL_WIDTH;
  const totalWidth = Math.max(MIN_TABLE_WIDTH, terminalWidth - 1);
  const availableContentWidth = totalWidth - TABLE_OVERHEAD;
  const idealModelWidth = Math.min(MAX_MODEL_WIDTH, Math.floor(availableContentWidth * 0.42));
  const modelWidth = Math.max(MIN_MODEL_WIDTH, idealModelWidth);
  const detailWidth = Math.max(MIN_DETAIL_WIDTH, availableContentWidth - modelWidth);

  return { totalWidth, modelWidth, detailWidth };
}

function horizontalRule(layout: TableLayout): string {
  return "─".repeat(layout.totalWidth);
}

function formatStatus(status: ProbeResult["status"]): string {
  const label = column(
    status === "success" ? "[成功]" : status === "timeout" ? "[超时]" : "[失败]",
    STATUS_WIDTH,
  );

  if (status === "success") return chalk.green(label);
  if (status === "timeout") return chalk.yellow(label);
  return chalk.red(label);
}

function column(value: string, width: number, align: "left" | "right" = "left"): string {
  const text = truncate(value, width);
  const padding = " ".repeat(Math.max(0, width - displayWidth(text)));
  return align === "right" ? `${padding}${text}` : `${text}${padding}`;
}

function wrapText(value: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  let word = "";

  const appendWord = (nextWord: string): void => {
    if (!nextWord) return;
    const separator = line ? " " : "";
    if (displayWidth(`${line}${separator}${nextWord}`) <= maxWidth) {
      line += `${separator}${nextWord}`;
      return;
    }

    if (line) lines.push(line);
    line = "";
    appendLongToken(nextWord);
  };

  const appendLongToken = (token: string): void => {
    for (const character of token) {
      if (displayWidth(`${line}${character}`) > maxWidth) {
        if (line) lines.push(line);
        line = "";
      }
      line += character;
    }
  };

  for (const character of value) {
    if (/\s/.test(character)) {
      appendWord(word);
      word = "";
    } else {
      word += character;
    }
  }
  appendWord(word);
  if (line || lines.length === 0) lines.push(line);
  return lines;
}

function normalizeText(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function truncate(value: string, maxWidth: number): string {
  if (displayWidth(value) <= maxWidth) return value;

  let output = "";
  for (const character of value) {
    if (displayWidth(`${output}${character}…`) > maxWidth) break;
    output += character;
  }
  return `${output}…`;
}

/** Approximate terminal column width, including common CJK and emoji ranges. */
function displayWidth(value: string): number {
  return [...value].reduce((width, character) => width + (isWideCharacter(character) ? 2 : 1), 0);
}

function isWideCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0) ?? 0;
  return (
    (codePoint >= 0x1100 && codePoint <= 0x115f) ||
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe10 && codePoint <= 0xfe6f) ||
    (codePoint >= 0xff00 && codePoint <= 0xffef) ||
    (codePoint >= 0x1f000 && codePoint <= 0x1faff)
  );
}
