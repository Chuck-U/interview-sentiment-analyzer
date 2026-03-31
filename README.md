# Interview Sentiment Analyzer

Desktop app for recording interviews and reviewing **offline**, **AI-assisted** feedback—built with **Electron**, **React**, and **TypeScript**. Capture microphone, webcam, and screen input, run a local analysis pipeline, and keep session data on your machine.

## Highlights

- **Local-first workflow** — Session artifacts and analysis stay under your control; optional cloud AI providers are configured in-app.
- **Rich capture** — Microphone metering, webcam preview, display capture, and recording lifecycle management.
- **Modern stack** — Vite, Redux Toolkit, Tailwind CSS v4, Drizzle ORM, and in-process ML via [Transformers.js](https://github.com/huggingface/transformers.js) where applicable.

## Requirements

- **Node.js** 20+ (recommended)
- **pnpm** 10+ (`corepack enable` or install from [pnpm.io](https://pnpm.io))

## Quick start

```bash
pnpm install
pnpm dev
```

This starts the Vite dev server and launches Electron against it.

## Scripts

| Command | Description |
| -------- | ----------- |
| `pnpm dev` | Run renderer + Electron in development |
| `pnpm build` | Production build (renderer + main process) |
| `pnpm dist` | Build and package installers via electron-builder |
| `pnpm test` | Backend unit tests (Node test runner) |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TypeScript `--noEmit` for renderer and Electron |
| `pnpm licenses list` | Dependency license summary (third-party notices) |

## Project layout

- `src/renderer/` — React UI, recording/capture UI, Redux store
- `src/backend/` — Electron main process, services, ML pipeline hooks
- `src/shared/` — Types, IPC contracts, and cross-layer utilities

## License

This project is licensed under the **MIT License** — see [`LICENSE`](./LICENSE).

Bundled and runtime-downloaded third-party libraries have their own licenses. The in-app **Settings → Licenses** section summarizes major components; use `pnpm licenses list` for a machine-readable dependency report.

## Acknowledgements

- [Electron](https://www.electronjs.org/)
- [Hugging Face Transformers.js](https://github.com/huggingface/transformers.js)
- [Remix Icon](https://remixicon.com/)
- [shadcn/ui](https://ui.shadcn.com/) and the broader open-source ecosystem this app builds on
