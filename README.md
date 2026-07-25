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
npm start
```

## 交互流程

1. 选择接口类型：OpenAI-compatible、Anthropic-compatible 或 Ollama-compatible。
2. 输入 Base URL 与 API Key（Key 不会回显、保存或写入日志）。
3. 工具获取模型列表。获取失败时会打印 HTTP、网络或响应格式错误并退出。
4. 确认是否探测所有模型；若否，终端中多选模型。
5. 所选模型并行探测，每个模型最多等待 30 秒，实时输出成功、失败或超时结果与最终汇总。

## 支持的接口

| 接口类型 | 模型列表 | 探测请求 |
| --- | --- | --- |
| OpenAI-compatible | `GET /v1/models` | `POST /v1/chat/completions` |
| Anthropic-compatible | `GET /v1/models` | `POST /v1/messages` |
| Ollama-compatible | `GET /api/tags` | `POST /api/chat` |

Base URL 可以带或不带末尾的 `/v1`。Ollama 会使用根路径下的 `/api/*` 端点，例如 `http://localhost:11434` 或 `http://localhost:11434/v1` 都会请求 `http://localhost:11434/api/tags`。

> 该工具用聊天请求测试所有被选模型。因此 embedding、rerank 或图像等非聊天模型通常会显示失败；服务端返回的真实原因会显示在终端中。
