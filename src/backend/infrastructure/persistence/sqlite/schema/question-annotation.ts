import type {
  ExpectedAnswerShape,
  QuestionAnnotationType,
} from "../../../../domain/question/question-annotation";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { mediaChunkTable } from "./media-chunk";
import { participantTable } from "./participant";
import { sessionTable } from "./session";

export const questionAnnotationTable = sqliteTable(
  "question_annotation",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessionTable.id, { onDelete: "cascade" }),
    chunkId: text("chunk_id")
      .notNull()
      .references(() => mediaChunkTable.id, { onDelete: "cascade" }),
    askerParticipantId: text("asker_participant_id")
      .notNull()
      .references(() => participantTable.id, { onDelete: "cascade" }),
    addressedToParticipantId: text("addressed_to_participant_id").references(
      () => participantTable.id,
      { onDelete: "set null" },
    ),
    startAt: text("start_at").notNull(),
    endAt: text("end_at").notNull(),
    questionText: text("question_text").notNull(),
    questionType: text("question_type").$type<QuestionAnnotationType>().notNull(),
    topicTagsJson: text("topic_tags_json").notNull(),
    ambiguityScore: real("ambiguity_score").notNull(),
    multiPart: integer("multi_part", { mode: "boolean" }).notNull(),
    expectedAnswerShape: text("expected_answer_shape")
      .$type<ExpectedAnswerShape>()
      .notNull(),
    annotationConfidence: real("annotation_confidence").notNull(),
    evidenceJson: text("evidence_json").notNull(),
  },
  (table) => [
    index("idx_question_annotation_session_id").on(table.sessionId),
    index("idx_question_annotation_chunk_id").on(table.chunkId),
    index("idx_question_annotation_asker").on(table.askerParticipantId),
    index("idx_question_annotation_start_at").on(table.startAt),
  ],
);
