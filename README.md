# ModelProbe

一个纯命令行模型探针工具：获取指定 API 的模型列表，并向选定模型并行发送 `hi` 来验证其是否可调用。

支持交互模式与非交互模式（适合脚本 / CI）。

## 安装与运行

需要 Node.js 18+（推荐 Node.js 20+）。

```bash
cd apps/modelprobe
npm install
npm run dev
```

编译后运行：

```bash
npm run build
npm test
npm start
```

```bash
# 也可直接调用编译产物
node dist/cli.js --help
```

## 命令概览

```bash
modelprobe                 # 交互模式（默认）
modelprobe probe [选项]    # 非交互探测
modelprobe list [选项]     # 仅获取模型列表
modelprobe help
modelprobe version
```

## 非交互用法

### 探测

```bash
# 临时连接 + 全部模型 + JSON
modelprobe probe \
  --type openai \
  --base-url https://api.example.com/v1 \
  --api-key "$OPENAI_API_KEY" \
  --all \
  --json

# 使用已保存配置，过滤模型并写入文件
modelprobe probe \
  --config "公司网关" \
  --filter "gpt|qwen" \
  --exclude "embed|tts|rerank" \
  --all \
  --output ./results.json

# 指定模型与并发
modelprobe probe \
  --type ollama \
  --base-url http://127.0.0.1:11434 \
  --models llama3.2,qwen2.5 \
  --concurrency 3

# 使用配置中保存的模型，不重新拉取列表
modelprobe probe --config "公司网关" --use-saved-models --all --json
```

### 仅列表

```bash
modelprobe list \
  --type openai \
  --base-url https://api.example.com/v1 \
  --filter "gpt" \
  --json
```

### 常用选项

**连接（`probe` / `list`，二选一）：**

| 选项 | 说明 |
| --- | --- |
| `--config <name>` | 使用已保存配置（名称精确匹配，忽略大小写） |
| `--type <openai\|anthropic\|ollama>` | 协议类型 |
| `--base-url <url>` | Base URL |
| `--api-key <key>` | API Key（Ollama 可省略） |

有 `--config` 时，命令行中的 `--type` / `--base-url` / `--api-key` 会覆盖配置文件中的对应字段。

**模型选择（`probe`）：**

| 选项 | 说明 |
| --- | --- |
| `--all` | 探测过滤后的全部模型 |
| `--models <id,id,...>` | 指定模型 ID（逗号分隔） |
| `--filter <regex>` | 仅保留 ID 匹配的模型（忽略大小写） |
| `--exclude <regex>` | 排除 ID 匹配的模型 |
| `--use-saved-models` | 使用配置里保存的模型，不拉远端列表（需 `--config`） |
| `--strict` | 过滤后为空，或 `--models` 含未知 ID 时失败 |

非交互 `probe` **必须**提供 `--all` 或 `--models`。

**探测行为（`probe`）：**

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| `--concurrency <n>` | `5` | 最大并发，范围 1–10 |
| `--timeout <ms>` | `60000` | 单模型总超时（含重试） |
| `--retries <n>` | `1` | 初始请求后的重试次数 |

**输出：**

| 选项 | 说明 |
| --- | --- |
| `--json` | 向 stdout 输出 JSON 报告；进度信息走 stderr |
| `--output <path>`, `-o` | 将 JSON 报告写入文件 |
| `--quiet`, `-q` | 减少人类可读日志 |
| `--no-color` | 禁用颜色（也尊重 `NO_COLOR`） |

### 环境变量

| 变量 | 作用 |
| --- | --- |
| `MODELPROBE_API_KEY` | 默认 API Key |
| `MODELPROBE_BASE_URL` | 默认 Base URL |
| `MODELPROBE_API_TYPE` | 默认协议类型 |
| `OPENAI_API_KEY` | `type=openai` 时的 Key 回退 |
| `ANTHROPIC_API_KEY` | `type=anthropic` 时的 Key 回退 |
| `NO_COLOR` | 禁用颜色 |

**API Key 解析顺序（非交互）：**

1. `--api-key`（显式传入，允许空字符串）
2. 若使用 `--config`：配置文件中的 key
3. `MODELPROBE_API_KEY`
4. 按 type 回退 `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`
5. 空字符串（例如 Ollama 无鉴权）

### 退出码

| Code | 含义 |
| --- | --- |
| `0` | 成功；`probe` 至少有一个模型成功，或 `list` 成功 |
| `1` | 运行失败，或全部模型失败 / 超时 |
| `2` | 用法错误（缺参、非法参数等） |

### JSON 报告（`probe --json`）

报告**不包含** API Key。成功响应的 `content` 会截断至约 200 字符。主要字段：

- `connection`：来源、协议、Base URL
- `options`：并发、超时、过滤条件等
- `summary`：成功 / 失败 / 超时计数，以及成功样本的 `latencyMs`（min / avg / p50 / p95）
- `usableModels`：探测成功的模型 ID 列表
- `results`：每个模型的状态、耗时、尝试次数、内容或错误

## 交互流程

无参数启动：

```bash
modelprobe
# 或
npm run dev
```

启动后先选择：

1. **使用保存的信息进行探测**
2. **从头开始输入信息进行探测**

### 使用保存的信息

进入后提供四个操作：

1. **选择保存的信息**：挑选一条已保存配置，再选择「使用保存的模型」或「重新选择模型」后开始探测；若重新选择模型，可选择是否写回该配置。
2. **新增信息**：输入名称、协议类型、Base URL、API Key，拉取并选择模型后保存；可选是否立即探测。
3. **修改现有信息**：编辑名称、协议、URL、Key，并可选择是否重新拉取模型列表。
4. **删除信息**：多选删除已保存配置。

配置文件按操作系统保存到用户级配置目录：

| 系统 | 默认位置 |
| --- | --- |
| Linux | `$XDG_CONFIG_HOME/modelprobe/connections.json`；未设置时为 `~/.config/modelprobe/connections.json` |
| macOS | `~/Library/Application Support/modelprobe/connections.json` |
| Windows | `%APPDATA%\\modelprobe\\connections.json`；未设置 `APPDATA` 时为 `%USERPROFILE%\\AppData\\Roaming\\modelprobe\\connections.json` |

升级后，工具会在新位置没有配置时自动读取原来的 `~/.modelprobe/connections.json`（Windows 为 `%USERPROFILE%\\.modelprobe\\connections.json`），并写入新位置；原文件会保留。API Key 以明文写入本地配置文件；在支持 POSIX 文件权限的系统上，工具会尽量将文件权限设为 `0600`，终端展示时会脱敏。

### 从头开始输入

1. 选择接口类型：OpenAI-compatible、Anthropic-compatible 或 Ollama-compatible。
2. 输入 Base URL 与 API Key（输入时 Key 不回显）。
3. 工具获取模型列表。获取失败时会打印 HTTP、网络或响应格式错误并退出。
4. 确认是否探测所有模型；若否，终端中多选模型。
5. 所选模型按用户指定的最大并发数（默认 5，最高 10）探测。单模型的请求、重试等待及重试总共最多持续 60 秒；遇到网络错误、`408`、`429` 或 `5xx` 时最多重试 1 次，实时输出成功、失败或超时结果与最终汇总（含延迟统计）。
6. 探测结束后可选择将本次连接信息（含所选模型）保存为配置。

## 支持的接口

| 接口类型 | 模型列表 | 探测请求 |
| --- | --- | --- |
| OpenAI-compatible | `GET /v1/models` | `POST /v1/chat/completions` |
| Anthropic-compatible | `GET /v1/models` | `POST /v1/messages` |
| Ollama-compatible | `GET /api/tags` | `POST /api/chat` |

Base URL 可以带或不带末尾的 `/v1`。Ollama 会使用根路径下的 `/api/*` 端点，例如 `http://localhost:11434` 或 `http://localhost:11434/v1` 都会请求 `http://localhost:11434/api/tags`。

模型列表请求也有 30 秒总超时，并会对网络错误、`408`、`429` 及 `5xx` 最多重试 2 次。服务端提供 `Retry-After` 时，工具会优先遵从该等待时间，但不会超过该请求的总超时预算。

> 该工具用聊天请求测试所有被选模型。因此 embedding、rerank 或图像等非聊天模型通常会显示失败；服务端返回的真实原因会显示在终端中。
