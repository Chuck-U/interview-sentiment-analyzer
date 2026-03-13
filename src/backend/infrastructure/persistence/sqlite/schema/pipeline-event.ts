import type { PipelineEventType, PipelineStageName } from "../../../../../shared";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const pipelineEventTable = sqliteTable(
  "pipeline_event",
  {
    eventId: text("event_id").primaryKey(),
    eventType: text("event_type").$type<PipelineEventType>().notNull(),
    schemaVersion: integer("schema_version").notNull(),
    sessionId: text("session_id").notNull(),
    chunkId: text("chunk_id"),
    stageName: text("stage_name").$type<PipelineStageName>(),
    causationId: text("causation_id"),
    correlationId: text("correlation_id").notNull(),
    occurredAt: text("occurred_at").notNull(),
    payloadJson: text("payload_json").notNull(),
    payloadSchemaVersion: integer("payload_schema_version").notNull(),
  },
  (table) => [
    index("idx_pipeline_event_session_id").on(table.sessionId),
    index("idx_pipeline_event_chunk_id").on(table.chunkId),
    index("idx_pipeline_event_type").on(table.eventType),
    index("idx_pipeline_event_occurred_at").on(table.occurredAt),
  ],
);
