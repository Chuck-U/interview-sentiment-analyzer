# Session Lifecycle Persistence

This backend keeps the local storage model unchanged:

- session metadata stays in a local SQLite database
- captured artifacts stay on the filesystem under the existing storage layout
- repository and use-case contracts stay stable above the persistence layer

## Drizzle Ownership

Drizzle owns the SQLite schema and query generation for the session lifecycle data model:

- `schema/session.ts` defines the `session` table and indexes
- `schema/media-chunk.ts` defines the `media_chunk` table and indexes
- `sqlite-database.ts` applies bootstrap PRAGMAs, versioned migrations, and integrity checks
- `sqlite-session-lifecycle.ts` keeps repository boundaries intact while executing Drizzle-generated SQL against the local SQLite file

## Durability Hardening

The current bootstrap hardens the local metadata store with:

- versioned migrations tracked in `__session_lifecycle_migrations`
- legacy-schema adoption so existing local databases are marked as version `1` without rewriting data
- `PRAGMA journal_mode = WAL` for crash-tolerant local writes
- `PRAGMA synchronous = NORMAL` with `busy_timeout` and `wal_autocheckpoint` for desktop-friendly durability
- `PRAGMA quick_check(1)` and `PRAGMA foreign_key_check` on startup
- fail-fast corruption handling: startup throws if integrity or foreign-key checks fail, leaving on-disk artifacts untouched for recovery or manual inspection

## Validation

Validated locally in this repository with:

- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm exec electron-builder --linux dir --publish never`

Automated coverage now also includes:

- migration adoption from the pre-Drizzle legacy schema
- persisted metadata surviving database reopen/restart
- lifecycle idempotency, artifact-first registration, and recovery behavior

Cross-platform note:

- the current environment validated Linux packaging directly
- packaging risk on macOS and Windows is reduced because this approach keeps SQLite inside Electron/Node runtime support and does not add a native SQLite addon dependency
