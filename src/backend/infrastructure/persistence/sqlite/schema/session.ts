import type { SessionStatus } from "../../../../../shared";
import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const sessionTable = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    status: text("status").$type<SessionStatus>().notNull(),
    captureSourcesJson: text("capture_sources_json").notNull(),
    startedAt: text("started_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    completedAt: text("completed_at"),
    idempotencyKey: text("idempotency_key"),
  },
  (table) => [
    uniqueIndex("idx_session_idempotency_key").on(table.idempotencyKey),
    index("idx_session_status").on(table.status),
  ],
);
