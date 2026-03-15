import type {
  ParticipantAssignmentSource,
  ParticipantRole,
} from "../../../../domain/participant/participant";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { sessionTable } from "./session";

export const participantTable = sqliteTable(
  "participant",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessionTable.id, { onDelete: "cascade" }),
    canonicalLabel: text("canonical_label").notNull(),
    displayName: text("display_name"),
    role: text("role").$type<ParticipantRole>().notNull(),
    roleConfidence: real("role_confidence").notNull(),
    assignmentSource: text("assignment_source")
      .$type<ParticipantAssignmentSource>()
      .notNull(),
    isPrimaryCandidate: integer("is_primary_candidate", {
      mode: "boolean",
    }).notNull(),
    mergedIntoParticipantId: text("merged_into_participant_id"),
    evidenceJson: text("evidence_json").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_participant_session_id").on(table.sessionId),
    index("idx_participant_role").on(table.role),
    index("idx_participant_primary_candidate").on(table.sessionId, table.isPrimaryCandidate),
  ],
);
