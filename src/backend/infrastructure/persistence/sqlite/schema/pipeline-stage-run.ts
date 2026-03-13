import type {
  PipelineExecutableStageName,
  PipelineStageRunStatus,
} from "../../../../../shared";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const pipelineStageRunTable = sqliteTable(
  "pipeline_stage_run",
  {
    runId: text("run_id").primaryKey(),
    eventId: text("event_id").notNull(),
    sessionId: text("session_id").notNull(),
    chunkId: text("chunk_id"),
    stageName: text("stage_name")
      .$type<PipelineExecutableStageName>()
      .notNull(),
    status: text("status").$type<PipelineStageRunStatus>().notNull(),
    attempt: integer("attempt").notNull(),
    leasedUntil: text("leased_until"),
    inputArtifactsJson: text("input_artifacts_json").notNull(),
    outputArtifactsJson: text("output_artifacts_json").notNull(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    queuedAt: text("queued_at").notNull(),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_pipeline_stage_run_event_id").on(table.eventId),
    index("idx_pipeline_stage_run_status").on(table.status),
    index("idx_pipeline_stage_run_stage_name").on(table.stageName),
    index("idx_pipeline_stage_run_session_id").on(table.sessionId),
    index("idx_pipeline_stage_run_chunk_id").on(table.chunkId),
    index("idx_pipeline_stage_run_lease").on(table.leasedUntil),
  ],
);
