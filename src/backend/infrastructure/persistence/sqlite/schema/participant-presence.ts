import { index, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { participantTable } from "./participant";
import { sessionTable } from "./session";

export const participantPresenceTable = sqliteTable(
  "participant_presence",
  {
    id: text("id").primaryKey(),
    participantId: text("participant_id")
      .notNull()
      .references(() => participantTable.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessionTable.id, { onDelete: "cascade" }),
    joinedAt: text("joined_at").notNull(),
    leftAt: text("left_at"),
    sourceHint: text("source_hint"),
    presenceConfidence: real("presence_confidence").notNull(),
    evidenceJson: text("evidence_json").notNull(),
  },
  (table) => [
    index("idx_participant_presence_session_id").on(table.sessionId),
    index("idx_participant_presence_participant_id").on(table.participantId),
    index("idx_participant_presence_joined_at").on(table.joinedAt),
  ],
);
