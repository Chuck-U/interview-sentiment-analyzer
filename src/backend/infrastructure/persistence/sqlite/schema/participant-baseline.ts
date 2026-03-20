import type { ParticipantBaselineScope } from "../../../../domain/participant/participant-baseline";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { participantTable } from "./participant";
import { sessionTable } from "./session";

export const participantBaselineTable = sqliteTable(
  "participant_baseline",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessionTable.id, { onDelete: "cascade" }),
    participantId: text("participant_id")
      .notNull()
      .references(() => participantTable.id, { onDelete: "cascade" }),
    scope: text("scope").$type<ParticipantBaselineScope>().notNull(),
    featureSetVersion: text("feature_set_version").notNull(),
    windowStartAt: text("window_start_at").notNull(),
    windowEndAt: text("window_end_at").notNull(),
    sampleCount: integer("sample_count").notNull(),
    baselineJson: text("baseline_json").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_participant_baseline_session_id").on(table.sessionId),
    index("idx_participant_baseline_participant_scope").on(
      table.participantId,
      table.scope,
      table.windowEndAt,
    ),
  ],
);
