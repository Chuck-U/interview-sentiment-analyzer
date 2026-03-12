import type { MediaChunkEntity } from "../../../../domain/capture/media-chunk";
import type { MediaChunkStatus } from "../../../../../shared";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { sessionTable } from "./session";

export const mediaChunkTable = sqliteTable(
  "media_chunk",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessionTable.id, { onDelete: "cascade" }),
    source: text("source").$type<MediaChunkEntity["source"]>().notNull(),
    status: text("status").$type<MediaChunkStatus>().notNull(),
    relativePath: text("relative_path").notNull(),
    recordedAt: text("recorded_at").notNull(),
    byteSize: integer("byte_size").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_media_chunk_session_id").on(table.sessionId),
    index("idx_media_chunk_status").on(table.status),
  ],
);
