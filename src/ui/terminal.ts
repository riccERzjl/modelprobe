import chalk from "chalk";
import type { ModelInfo, ProbeResult } from "../types.js";

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

export function printProbeStart(modelCount: number): void {
  const layout = getTableLayout();
  console.log(chalk.cyan(`\n开始并行探测 ${modelCount} 个模型（单模型最长等待 30 秒）...\n`));
  printTableHeader(layout);
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
  console.log(chalk.bold("探测完成：") + `共 ${results.length} 个；${chalk.green(`成功 ${success}`)}，${chalk.red(`失败 ${failed}`)}，${chalk.yellow(`超时 ${timeout}`)}。`);
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
  switch (result.status) {
    case "success":
      return { text: normalizeText(result.content) || "（响应无文本内容）" };
    case "timeout":
      return { text: normalizeText(result.error) || "请求超过 30 秒" };
    case "failed":
      return { text: normalizeText(result.error) || "未知错误" };
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
