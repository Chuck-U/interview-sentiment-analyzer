## Backend Jest Migration

This branch introduces a focused compiled-Jest path for the live transcription rewrite.

- Run `pnpm test:backend:jest` for the migrated backend tests that cover:
  - live question detection inputs
  - live answer relevance scoring and interval buffering
  - live transcription graph behavior
  - transcript log persistence migration
  - model manifest defaults for answer relevance
- Run `pnpm test:backend:legacy` for the remaining backend `node:test` files.
- The broader backend suite still has legacy `node:test` files, and `pnpm test` currently routes to that legacy runner while the migration is in progress.
- New or touched tests in the live transcription / answer relevance area should migrate to Jest first instead of extending the legacy `node:test` path.
- Persistence migration for transcript logs is backward-safe:
  - new writes use `transcript.log`
  - a legacy `transcrpt.log` file is renamed forward on the next append
