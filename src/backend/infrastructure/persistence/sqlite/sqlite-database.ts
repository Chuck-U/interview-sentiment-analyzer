import { DatabaseSync } from "node:sqlite";

import type { SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import { drizzle } from "drizzle-orm/sqlite-proxy";

import * as schema from "./schema";

const SESSION_LIFECYCLE_MIGRATIONS_TABLE = "__session_lifecycle_migrations";
const LEGACY_SESSION_LIFECYCLE_SCHEMA_VERSION = 1;

type SessionLifecycleMigration = {
  readonly version: number;
  readonly description: string;
  readonly statements: readonly string[];
};

export const SESSION_LIFECYCLE_SCHEMA_VERSION = 3;

export const SESSION_LIFECYCLE_DURABILITY_HARDENING = {
  corruptionHandling:
    "Fail startup if quick integrity checks or foreign-key checks report corruption.",
  integrityChecks:
    "Run PRAGMA quick_check(1) and PRAGMA foreign_key_check during bootstrap.",
  migrations:
    "Apply versioned migrations and adopt the legacy unversioned schema without rewriting data.",
  walStrategy:
    "Keep WAL enabled with busy timeout and auto-checkpointing for local desktop durability.",
} as const;

const sessionLifecycleMigrations: readonly SessionLifecycleMigration[] = [
  {
    version: 1,
    description: "create session lifecycle tables",
    statements: [
      `
        CREATE TABLE IF NOT EXISTS session (
          id TEXT PRIMARY KEY,
          status TEXT NOT NULL,
          capture_sources_json TEXT NOT NULL,
          started_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          completed_at TEXT,
          idempotency_key TEXT UNIQUE
        )
      `,
      `
        CREATE TABLE IF NOT EXISTS media_chunk (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          source TEXT NOT NULL,
          status TEXT NOT NULL,
          relative_path TEXT NOT NULL,
          recorded_at TEXT NOT NULL,
          byte_size INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(session_id) REFERENCES session(id) ON DELETE CASCADE
        )
      `,
      "CREATE INDEX IF NOT EXISTS idx_session_status ON session(status)",
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_session_idempotency_key ON session(idempotency_key)",
      "CREATE INDEX IF NOT EXISTS idx_media_chunk_session_id ON media_chunk(session_id)",
      "CREATE INDEX IF NOT EXISTS idx_media_chunk_status ON media_chunk(status)",
    ],
  },
  {
    version: 2,
    description: "create durable pipeline tables",
    statements: [
      `
        CREATE TABLE IF NOT EXISTS pipeline_event (
          event_id TEXT PRIMARY KEY,
          event_type TEXT NOT NULL,
          schema_version INTEGER NOT NULL,
          session_id TEXT NOT NULL,
          chunk_id TEXT,
          stage_name TEXT,
          causation_id TEXT,
          correlation_id TEXT NOT NULL,
          occurred_at TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          payload_schema_version INTEGER NOT NULL,
          FOREIGN KEY(session_id) REFERENCES session(id) ON DELETE CASCADE,
          FOREIGN KEY(chunk_id) REFERENCES media_chunk(id) ON DELETE CASCADE
        )
      `,
      `
        CREATE TABLE IF NOT EXISTS pipeline_stage_run (
          run_id TEXT PRIMARY KEY,
          event_id TEXT NOT NULL UNIQUE,
          session_id TEXT NOT NULL,
          chunk_id TEXT,
          stage_name TEXT NOT NULL,
          status TEXT NOT NULL,
          attempt INTEGER NOT NULL,
          leased_until TEXT,
          input_artifacts_json TEXT NOT NULL,
          output_artifacts_json TEXT NOT NULL,
          error_code TEXT,
          error_message TEXT,
          queued_at TEXT NOT NULL,
          started_at TEXT,
          completed_at TEXT,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(event_id) REFERENCES pipeline_event(event_id) ON DELETE CASCADE,
          FOREIGN KEY(session_id) REFERENCES session(id) ON DELETE CASCADE,
          FOREIGN KEY(chunk_id) REFERENCES media_chunk(id) ON DELETE CASCADE
        )
      `,
      "CREATE INDEX IF NOT EXISTS idx_pipeline_event_session_id ON pipeline_event(session_id)",
      "CREATE INDEX IF NOT EXISTS idx_pipeline_event_chunk_id ON pipeline_event(chunk_id)",
      "CREATE INDEX IF NOT EXISTS idx_pipeline_event_type ON pipeline_event(event_type)",
      "CREATE INDEX IF NOT EXISTS idx_pipeline_event_occurred_at ON pipeline_event(occurred_at)",
      "CREATE INDEX IF NOT EXISTS idx_pipeline_stage_run_status ON pipeline_stage_run(status)",
      "CREATE INDEX IF NOT EXISTS idx_pipeline_stage_run_stage_name ON pipeline_stage_run(stage_name)",
      "CREATE INDEX IF NOT EXISTS idx_pipeline_stage_run_session_id ON pipeline_stage_run(session_id)",
      "CREATE INDEX IF NOT EXISTS idx_pipeline_stage_run_chunk_id ON pipeline_stage_run(chunk_id)",
      "CREATE INDEX IF NOT EXISTS idx_pipeline_stage_run_lease ON pipeline_stage_run(leased_until)",
    ],
  },
  {
    version: 3,
    description: "create participant analysis tables",
    statements: [
      `
        CREATE TABLE IF NOT EXISTS participant (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          canonical_label TEXT NOT NULL,
          display_name TEXT,
          role TEXT NOT NULL,
          role_confidence REAL NOT NULL,
          assignment_source TEXT NOT NULL,
          is_primary_candidate INTEGER NOT NULL,
          merged_into_participant_id TEXT,
          evidence_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(session_id) REFERENCES session(id) ON DELETE CASCADE
        )
      `,
      `
        CREATE TABLE IF NOT EXISTS participant_presence (
          id TEXT PRIMARY KEY,
          participant_id TEXT NOT NULL,
          session_id TEXT NOT NULL,
          joined_at TEXT NOT NULL,
          left_at TEXT,
          source_hint TEXT,
          presence_confidence REAL NOT NULL,
          evidence_json TEXT NOT NULL,
          FOREIGN KEY(participant_id) REFERENCES participant(id) ON DELETE CASCADE,
          FOREIGN KEY(session_id) REFERENCES session(id) ON DELETE CASCADE
        )
      `,
      `
        CREATE TABLE IF NOT EXISTS question_annotation (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          chunk_id TEXT NOT NULL,
          asker_participant_id TEXT NOT NULL,
          addressed_to_participant_id TEXT,
          start_at TEXT NOT NULL,
          end_at TEXT NOT NULL,
          question_text TEXT NOT NULL,
          question_type TEXT NOT NULL,
          topic_tags_json TEXT NOT NULL,
          ambiguity_score REAL NOT NULL,
          multi_part INTEGER NOT NULL,
          expected_answer_shape TEXT NOT NULL,
          annotation_confidence REAL NOT NULL,
          evidence_json TEXT NOT NULL,
          FOREIGN KEY(session_id) REFERENCES session(id) ON DELETE CASCADE,
          FOREIGN KEY(chunk_id) REFERENCES media_chunk(id) ON DELETE CASCADE,
          FOREIGN KEY(asker_participant_id) REFERENCES participant(id) ON DELETE CASCADE,
          FOREIGN KEY(addressed_to_participant_id) REFERENCES participant(id) ON DELETE SET NULL
        )
      `,
      `
        CREATE TABLE IF NOT EXISTS participant_baseline (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          participant_id TEXT NOT NULL,
          scope TEXT NOT NULL,
          feature_set_version TEXT NOT NULL,
          window_start_at TEXT NOT NULL,
          window_end_at TEXT NOT NULL,
          sample_count INTEGER NOT NULL,
          baseline_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(session_id) REFERENCES session(id) ON DELETE CASCADE,
          FOREIGN KEY(participant_id) REFERENCES participant(id) ON DELETE CASCADE
        )
      `,
      "CREATE INDEX IF NOT EXISTS idx_participant_session_id ON participant(session_id)",
      "CREATE INDEX IF NOT EXISTS idx_participant_role ON participant(role)",
      "CREATE INDEX IF NOT EXISTS idx_participant_primary_candidate ON participant(session_id, is_primary_candidate)",
      "CREATE INDEX IF NOT EXISTS idx_participant_presence_session_id ON participant_presence(session_id)",
      "CREATE INDEX IF NOT EXISTS idx_participant_presence_participant_id ON participant_presence(participant_id)",
      "CREATE INDEX IF NOT EXISTS idx_participant_presence_joined_at ON participant_presence(joined_at)",
      "CREATE INDEX IF NOT EXISTS idx_question_annotation_session_id ON question_annotation(session_id)",
      "CREATE INDEX IF NOT EXISTS idx_question_annotation_chunk_id ON question_annotation(chunk_id)",
      "CREATE INDEX IF NOT EXISTS idx_question_annotation_asker ON question_annotation(asker_participant_id)",
      "CREATE INDEX IF NOT EXISTS idx_question_annotation_start_at ON question_annotation(start_at)",
      "CREATE INDEX IF NOT EXISTS idx_participant_baseline_session_id ON participant_baseline(session_id)",
      "CREATE INDEX IF NOT EXISTS idx_participant_baseline_participant_scope ON participant_baseline(participant_id, scope, window_end_at)",
    ],
  },
] as const;

export type SessionLifecycleDatabase = {
  readonly drizzle: SqliteRemoteDatabase<typeof schema>;
  readonly sqlite: DatabaseSync;
};

type IntegrityCheckResultRow = {
  readonly foreign_key_check?: string;
  readonly integrity_check?: string;
  readonly quick_check?: string;
};

type MigrationVersionRow = {
  readonly version: number;
};

function applyDurabilityPragmas(database: DatabaseSync): void {
  database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA synchronous = NORMAL");
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("PRAGMA busy_timeout = 5000");
  database.exec("PRAGMA wal_autocheckpoint = 1000");
}

function ensureMigrationTable(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS ${SESSION_LIFECYCLE_MIGRATIONS_TABLE} (
      version INTEGER PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);
}

function hasTable(database: DatabaseSync, tableName: string): boolean {
  const row = database
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
    )
    .get(tableName) as { name: string } | undefined;

  return row !== undefined;
}

function listAppliedMigrationVersions(
  database: DatabaseSync,
): ReadonlySet<number> {
  const rows = database
    .prepare(
      `SELECT version FROM ${SESSION_LIFECYCLE_MIGRATIONS_TABLE} ORDER BY version ASC`,
    )
    .all() as MigrationVersionRow[];

  return new Set(rows.map((row) => row.version));
}

function adoptLegacySchemaIfNeeded(database: DatabaseSync): void {
  const appliedVersions = listAppliedMigrationVersions(database);
  const hasLegacyTables =
    hasTable(database, "session") && hasTable(database, "media_chunk");

  if (!hasLegacyTables || appliedVersions.size > 0) {
    return;
  }

  const now = new Date().toISOString();

  database
    .prepare(
      `
        INSERT INTO ${SESSION_LIFECYCLE_MIGRATIONS_TABLE} (
          version,
          description,
          applied_at
        )
        VALUES (?, ?, ?)
      `,
    )
    .run(
      LEGACY_SESSION_LIFECYCLE_SCHEMA_VERSION,
      "adopt legacy session lifecycle schema",
      now,
    );
}

function applyPendingMigrations(database: DatabaseSync): void {
  const appliedVersions = listAppliedMigrationVersions(database);

  for (const migration of sessionLifecycleMigrations) {
    if (appliedVersions.has(migration.version)) {
      continue;
    }

    const now = new Date().toISOString();
    database.exec("BEGIN IMMEDIATE TRANSACTION");

    try {
      for (const statement of migration.statements) {
        database.exec(statement);
      }

      database
        .prepare(
          `
            INSERT INTO ${SESSION_LIFECYCLE_MIGRATIONS_TABLE} (
              version,
              description,
              applied_at
            )
            VALUES (?, ?, ?)
          `,
        )
        .run(migration.version, migration.description, now);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }
}

function runIntegrityChecks(database: DatabaseSync): void {
  const quickCheckRow = database
    .prepare("PRAGMA quick_check(1)")
    .get() as IntegrityCheckResultRow | undefined;
  const quickCheckResult = quickCheckRow
    ? Object.values(quickCheckRow)[0]
    : undefined;

  if (quickCheckResult !== "ok") {
    throw new Error(
      `Session lifecycle SQLite integrity check failed: ${String(quickCheckResult ?? "unknown error")}`,
    );
  }

  const foreignKeyViolations = database
    .prepare("PRAGMA foreign_key_check")
    .all() as IntegrityCheckResultRow[];

  if (foreignKeyViolations.length > 0) {
    throw new Error(
      "Session lifecycle SQLite foreign key check failed during bootstrap.",
    );
  }
}

export function initializeSessionLifecycleDatabase(
  database: DatabaseSync,
): SessionLifecycleDatabase {
  applyDurabilityPragmas(database);
  ensureMigrationTable(database);
  adoptLegacySchemaIfNeeded(database);
  applyPendingMigrations(database);
  runIntegrityChecks(database);

  return {
    drizzle: drizzle(async () => ({ rows: [] }), {
      schema,
    }),
    sqlite: database,
  };
}
