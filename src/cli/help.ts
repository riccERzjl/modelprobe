export function printUsage(stream: NodeJS.WritableStream = process.stdout): void {
  stream.write(`ModelProbe — 模型连通性探测工具

用法:
  modelprobe                         启动交互模式
  modelprobe probe [选项]            非交互探测
  modelprobe list [选项]             仅获取模型列表
  modelprobe help                    显示帮助
  modelprobe version                 显示版本

连接（probe / list，二选一）:
  --config <name>                    使用已保存配置（名称精确匹配，忽略大小写）
  --type <openai|anthropic|ollama>   协议类型
  --base-url <url>                   Base URL
  --api-key <key>                    API Key（Ollama 可省略）

模型选择（probe）:
  --all                              探测过滤后的全部模型
  --models <id,id,...>               指定模型 ID（逗号分隔）
  --filter <regex>                   仅保留 ID 匹配的模型
  --exclude <regex>                  排除 ID 匹配的模型
  --use-saved-models                 使用配置中保存的模型，不拉远端列表（需 --config）
  --strict                           过滤后为空或 --models 含未知 ID 时失败

探测行为（probe）:
  --concurrency <n>                  最大并发（1-10，默认 5）
  --timeout <ms>                     单模型总超时（默认 60000）
  --retries <n>                      失败重试次数（默认 1）

输出:
  --json                             向 stdout 输出 JSON 报告（进度走 stderr）
  --output <path>, -o <path>         将 JSON 报告写入文件
  --quiet, -q                        减少人类可读日志
  --no-color                         禁用颜色

环境变量:
  MODELPROBE_API_KEY / MODELPROBE_BASE_URL / MODELPROBE_API_TYPE
  OPENAI_API_KEY（type=openai 时） / ANTHROPIC_API_KEY（type=anthropic 时）
  NO_COLOR

退出码:
  0  成功（probe 至少一个模型成功；list 成功）
  1  运行失败或全部模型失败/超时
  2  用法错误

示例:
  modelprobe probe --type ollama --base-url http://127.0.0.1:11434 --all --json
  modelprobe probe --config "公司网关" --filter "gpt|qwen" --exclude "embed" -o results.json
  modelprobe list --type openai --base-url https://api.example.com/v1 --json
`);
}

export function printVersion(version: string, stream: NodeJS.WritableStream = process.stdout): void {
  stream.write(`modelprobe ${version}\n`);
}
