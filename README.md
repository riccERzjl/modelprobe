# ModelProbe

一个纯命令行模型探针工具：获取指定 API 的模型列表，并向选定模型并行发送 `hi` 来验证其是否可调用。

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

## 交互流程

启动后先选择：

1. **使用保存的信息进行探测**
2. **从头开始输入信息进行探测**

### 使用保存的信息

进入后提供四个操作：

1. **选择保存的信息**：挑选一条已保存配置，再选择「使用保存的模型」或「重新选择模型」后开始探测；若重新选择模型，可选择是否写回该配置。
2. **新增信息**：输入名称、协议类型、Base URL、API Key，拉取并选择模型后保存；可选是否立即探测。
3. **修改现有信息**：编辑名称、协议、URL、Key，并可选择是否重新拉取模型列表。
4. **删除信息**：多选删除已保存配置。

配置文件路径：

```text
~/.modelprobe/connections.json
```

每条配置保存：协议类型、Base URL、API Key、模型列表。API Key 以明文写入本地配置文件（文件权限尽量设为 `0600`），终端展示时会脱敏。

### 从头开始输入

与原先流程一致：

1. 选择接口类型：OpenAI-compatible、Anthropic-compatible 或 Ollama-compatible。
2. 输入 Base URL 与 API Key（输入时 Key 不回显）。
3. 工具获取模型列表。获取失败时会打印 HTTP、网络或响应格式错误并退出。
4. 确认是否探测所有模型；若否，终端中多选模型。
5. 所选模型按用户指定的最大并发数（默认 5，最高 10）探测。单模型的请求、重试等待及重试总共最多持续 60 秒；遇到网络错误、`408`、`429` 或 `5xx` 时最多重试 1 次，实时输出成功、失败或超时结果与最终汇总。
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
