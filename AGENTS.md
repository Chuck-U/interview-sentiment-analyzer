---
description: 
alwaysApply: true
---

# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Electron desktop app ("Interview Sentiment Analyzer") for interview feedback. Single-product repo, not a monorepo. Stack: Electron 41 + React 19 + TypeScript + Vite 7 + Tailwind CSS 4 + shadcn/ui + SQLite (node:sqlite built-in) + Drizzle ORM + HuggingFace Transformers.js.

### Key commands

All documented in `package.json` scripts. Quick reference:

| Command | Purpose |
|---|---|
| `pnpm dev` | Start Vite renderer (port 5183) + Electron concurrently |
| `pnpm lint` | ESLint (warnings only in current codebase, no errors) |
| `pnpm typecheck` | TypeScript check for both renderer and electron configs |
| `pnpm test` | Build electron, then run Node.js test runner on backend tests |
| `pnpm build` | Full production build (renderer via Vite, electron via tsc) |
| `pnpm dev:log` | recompile typescript and start Vite + Electron Concurrently
### Running on headless / Cloud Agent VMs

- The VM has a VNC display at `:1`. Set `DISPLAY=:1` when running `pnpm dev` so Electron renders on the VNC desktop (visible via the Desktop pane).
- Do **not** use `xvfb-run` if you want to see the app in the Desktop pane; it creates an invisible virtual display.
- dbus errors in the Electron log (`Failed to connect to the bus`) are harmless in this environment and can be ignored.
- On first launch, Electron downloads HuggingFace ONNX models to `~/.config/interview-sentiment-analyzer/models`. Subsequent launches use the cache and are faster.

### Architecture notes

- `electron/main/` — Electron main process (window management, IPC, tray, shortcuts)
- `src/renderer/` — React UI served by Vite in dev
- `src/backend/` — Clean-architecture backend (domain, application, infrastructure) running in Electron main process
- `src/shared/` — Shared types/contracts between main and renderer
- SQLite uses Node.js built-in `node:sqlite` (`DatabaseSync`), requires Node 22.5+. No native addons needed.

### pnpm build scripts warning

After `pnpm install`, pnpm may warn about ignored build scripts for `onnxruntime-node`, `protobufjs`, and `sharp`. These are non-blocking; the app runs fine without them. If they become needed, add them to `pnpm.onlyBuiltDependencies` in `package.json` rather than using interactive `pnpm approve-builds`.
