# Contributing to ModelProbe

## Development setup

```bash
npm install
npm run build
npm run dev
```

## Before opening a change

- Run `npm run build` and ensure TypeScript compilation succeeds.
- Keep API keys, endpoint credentials, `.env` files, `node_modules/`, and generated `dist/` output out of Git.
- Do not log or persist API keys. The CLI must retain its current in-memory-only credential behavior.
- Keep protocol-specific request/response handling in `src/adapters/`; shared CLI behavior belongs in `src/services/` or `src/ui/`.

## Commit convention

Use concise, imperative commit subjects, for example:

```text
feat: add Azure OpenAI adapter
fix: report malformed model responses
```
