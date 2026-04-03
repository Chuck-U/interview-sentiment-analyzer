import { z } from "zod";

import {
  createMissingArtifactKindsError,
  createMissingChunkIdError,
  createUnsupportedArtifactKindsError,
  toPipelineValidationError,
} from "./errors";
import { MEDIA_CHUNK_SOURCES } from "./session-lifecycle";

export const PIPELINE_EVENT_SCHEMA_VERSION = 1 as const;

export const PIPELINE_STAGE_NAMES = [
  "chunk.registered",
  "transcribe_chunk.requested",
  "transcript.ready",
  "resolve_participants.requested",
  "participants.ready",
  "derive_signals.requested",
  "signals.ready",
  "annotate_questions.requested",
  "questions.ready",
  "score_interaction.requested",
  "interaction.metrics.ready",
  "update_baselines.requested",
  "baselines.ready",
  "analyze_chunk.requested",
  "chunk.analysis.ready",
  "condense_context.requested",
  "context.ready",
  "session.finalization.requested",
  "session.summary.requested",
  "session.summary.ready",
  "coaching.requested",
  "coaching.ready",
  "pipeline.failed",
] as const;

export const PIPELINE_EVENT_TYPES = PIPELINE_STAGE_NAMES;
export const PIPELINE_EXECUTABLE_STAGE_NAMES = [
  "transcribe_chunk.requested",
  "resolve_participants.requested",
  "derive_signals.requested",
  "annotate_questions.requested",
  "score_interaction.requested",
  "update_baselines.requested",
  "analyze_chunk.requested",
  "condense_context.requested",
  "session.summary.requested",
  "coaching.requested",
] as const;
export const PIPELINE_STAGE_RUN_STATUSES = [
  "queued",
  "running",
  "completed",
  "failed",
  "dead-letter",
] as const;

export const PIPELINE_ARTIFACT_KINDS = [
  "media-chunk",
  "transcript",
  "participant-set",
  "signal-set",
  "question-set",
  "interaction-metrics",
  "participant-baseline",
  "chunk-analysis",
  "context-summary",
  "session-summary",
  "coaching-feedback",
] as const;

export const REDUCED_PIPELINE_ARTIFACT_KINDS = [
  "media-chunk",
  "transcript",
] as const;


export type PipelineStageName = (typeof PIPELINE_STAGE_NAMES)[number];
export type PipelineEventType = (typeof PIPELINE_EVENT_TYPES)[number];
export type PipelineExecutableStageName =
  (typeof PIPELINE_EXECUTABLE_STAGE_NAMES)[number];
export type PipelineArtifactKind = (typeof PIPELINE_ARTIFACT_KINDS)[number];
export type PipelineStageRunStatus =
  (typeof PIPELINE_STAGE_RUN_STATUSES)[number];

const pipelineStageNameSchema = z.enum(PIPELINE_STAGE_NAMES);
const pipelineEventTypeSchema = z.enum(PIPELINE_EVENT_TYPES);
const pipelineExecutableStageNameSchema = z.enum(PIPELINE_EXECUTABLE_STAGE_NAMES);
const pipelineArtifactKindSchema = z.enum(PIPELINE_ARTIFACT_KINDS);
const mediaChunkSourceSchema = z.enum(MEDIA_CHUNK_SOURCES);

function nonEmptyTrimmedStringSchema(message: string) {
  return z.string().trim().min(1, message);
}

function optionalTrimmedStringSchema(message: string) {
  return z.string().trim().min(1, message).optional();
}

const pipelineArtifactPathSchema = z
  .string()
  .trim()
  .min(1, "pipeline artifact paths must be non-empty")
  .transform((value) => value.replaceAll("\\", "/"))
  .transform((value, context) => {
    if (
      value.startsWith("/") ||
      /^[A-Za-z]:\//.test(value) ||
      value.startsWith("//")
    ) {
      context.addIssue({
        code: "custom",
        message: "pipeline artifact paths must be session-relative",
      });
      return z.NEVER;
    }

    const segments = value
      .split("/")
      .filter((segment) => segment.length > 0 && segment !== ".");

    if (segments.length === 0) {
      context.addIssue({
        code: "custom",
        message: "pipeline artifact paths must include at least one segment",
      });
      return z.NEVER;
    }

    if (segments.some((segment) => segment === "..")) {
      context.addIssue({
        code: "custom",
        message: "pipeline artifact paths cannot escape the session root",
      });
      return z.NEVER;
    }

    return segments.join("/");
  });

const pipelineArtifactRefSchema = z.object({
  artifactId: nonEmptyTrimmedStringSchema(
    "pipeline artifacts require a non-empty artifactId",
  ),
  artifactKind: pipelineArtifactKindSchema,
  relativePath: pipelineArtifactPathSchema,
  mimeType: optionalTrimmedStringSchema(
    "pipeline artifacts require a non-empty mimeType when provided",
  ),
  byteSize: z
    .number()
    .nonnegative("pipeline artifacts require a non-negative byteSize")
    .optional(),
  sha256: optionalTrimmedStringSchema(
    "pipeline artifacts require a non-empty sha256 when provided",
  ),
  createdAt: optionalTrimmedStringSchema(
    "pipeline artifacts require a non-empty createdAt when provided",
  ),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

type PipelineArtifactRefShape = z.infer<typeof pipelineArtifactRefSchema>;

const reducedPipelineArtifactRefSchema = pipelineArtifactRefSchema.clone().safeExtend({
  artifactKind: z.enum(REDUCED_PIPELINE_ARTIFACT_KINDS)
})

export type PipelineArtifactRef<
  TArtifactKind extends PipelineArtifactKind = PipelineArtifactKind,
> = Omit<PipelineArtifactRefShape, "artifactKind"> & {
  readonly artifactKind: TArtifactKind;
};

export type ReducedPipelineArtifactRef = z.infer<typeof reducedPipelineArtifactRefSchema>;

const pipelineArtifactArraySchema = z.array(pipelineArtifactRefSchema);

const pipelineArtifactPayloadSchema = z.object({
  inputArtifacts: pipelineArtifactArraySchema,
  outputArtifacts: pipelineArtifactArraySchema,
});

const chunkRegisteredPayloadSchema = pipelineArtifactPayloadSchema.extend({
  chunkId: nonEmptyTrimmedStringSchema("chunk.registered payload requires chunkId"),
  source: mediaChunkSourceSchema,
  recordedAt: nonEmptyTrimmedStringSchema(
    "chunk.registered payload requires recordedAt",
  ),
  registeredAt: nonEmptyTrimmedStringSchema(
    "chunk.registered payload requires registeredAt",
  ),
  byteSize: z
    .number()
    .nonnegative("chunk.registered payload requires a non-negative byteSize"),
});

const transcribeChunkRequestedPayloadSchema = pipelineArtifactPayloadSchema.extend({
  chunkId: nonEmptyTrimmedStringSchema(
    "transcribe_chunk.requested payload requires chunkId",
  ),
  requestedAt: nonEmptyTrimmedStringSchema(
    "transcribe_chunk.requested payload requires requestedAt",
  ),
});

const transcriptReadyPayloadSchema = pipelineArtifactPayloadSchema.extend({
  chunkId: nonEmptyTrimmedStringSchema("transcript.ready payload requires chunkId"),
  completedAt: nonEmptyTrimmedStringSchema(
    "transcript.ready payload requires completedAt",
  ),
  language: optionalTrimmedStringSchema(
    "transcript.ready payload requires a non-empty language when provided",
  ),
});

const resolveParticipantsRequestedPayloadSchema =
  pipelineArtifactPayloadSchema.extend({
    chunkId: nonEmptyTrimmedStringSchema(
      "resolve_participants.requested payload requires chunkId",
    ),
    requestedAt: nonEmptyTrimmedStringSchema(
      "resolve_participants.requested payload requires requestedAt",
    ),
  });

const participantsReadyPayloadSchema = pipelineArtifactPayloadSchema.extend({
  chunkId: nonEmptyTrimmedStringSchema("participants.ready payload requires chunkId"),
  completedAt: nonEmptyTrimmedStringSchema(
    "participants.ready payload requires completedAt",
  ),
  participantCount: z
    .number()
    .int("participants.ready payload requires an integer participantCount")
    .nonnegative(
      "participants.ready payload requires a non-negative participantCount",
    ),
});

const deriveSignalsRequestedPayloadSchema = pipelineArtifactPayloadSchema.extend({
  chunkId: nonEmptyTrimmedStringSchema(
    "derive_signals.requested payload requires chunkId",
  ),
  requestedAt: nonEmptyTrimmedStringSchema(
    "derive_signals.requested payload requires requestedAt",
  ),
});

const signalsReadyPayloadSchema = pipelineArtifactPayloadSchema.extend({
  chunkId: nonEmptyTrimmedStringSchema("signals.ready payload requires chunkId"),
  completedAt: nonEmptyTrimmedStringSchema(
    "signals.ready payload requires completedAt",
  ),
  signalCategories: z.array(
    nonEmptyTrimmedStringSchema(
      "signals.ready payload requires non-empty signal category names",
    ),
  ),
});

const annotateQuestionsRequestedPayloadSchema = pipelineArtifactPayloadSchema.extend({
  chunkId: nonEmptyTrimmedStringSchema(
    "annotate_questions.requested payload requires chunkId",
  ),
  requestedAt: nonEmptyTrimmedStringSchema(
    "annotate_questions.requested payload requires requestedAt",
  ),
});

const questionsReadyPayloadSchema = pipelineArtifactPayloadSchema.extend({
  chunkId: nonEmptyTrimmedStringSchema("questions.ready payload requires chunkId"),
  completedAt: nonEmptyTrimmedStringSchema(
    "questions.ready payload requires completedAt",
  ),
  questionCount: z
    .number()
    .int("questions.ready payload requires an integer questionCount")
    .nonnegative("questions.ready payload requires a non-negative questionCount"),
});

const scoreInteractionRequestedPayloadSchema = pipelineArtifactPayloadSchema.extend({
  chunkId: nonEmptyTrimmedStringSchema(
    "score_interaction.requested payload requires chunkId",
  ),
  requestedAt: nonEmptyTrimmedStringSchema(
    "score_interaction.requested payload requires requestedAt",
  ),
});

const interactionMetricsReadyPayloadSchema = pipelineArtifactPayloadSchema.extend({
  chunkId: nonEmptyTrimmedStringSchema(
    "interaction.metrics.ready payload requires chunkId",
  ),
  completedAt: nonEmptyTrimmedStringSchema(
    "interaction.metrics.ready payload requires completedAt",
  ),
  metricFamilies: z.array(
    nonEmptyTrimmedStringSchema(
      "interaction.metrics.ready payload requires non-empty metric family names",
    ),
  ),
});

const updateBaselinesRequestedPayloadSchema = pipelineArtifactPayloadSchema.extend({
  chunkId: nonEmptyTrimmedStringSchema(
    "update_baselines.requested payload requires chunkId",
  ),
  requestedAt: nonEmptyTrimmedStringSchema(
    "update_baselines.requested payload requires requestedAt",
  ),
});

const baselinesReadyPayloadSchema = pipelineArtifactPayloadSchema.extend({
  chunkId: nonEmptyTrimmedStringSchema("baselines.ready payload requires chunkId"),
  completedAt: nonEmptyTrimmedStringSchema(
    "baselines.ready payload requires completedAt",
  ),
  baselineScope: z.enum(["rolling-session", "session"]),
});

const analyzeChunkRequestedPayloadSchema = pipelineArtifactPayloadSchema.extend({
  chunkId: nonEmptyTrimmedStringSchema(
    "analyze_chunk.requested payload requires chunkId",
  ),
  requestedAt: nonEmptyTrimmedStringSchema(
    "analyze_chunk.requested payload requires requestedAt",
  ),
});

const chunkAnalysisReadyPayloadSchema = pipelineArtifactPayloadSchema.extend({
  chunkId: nonEmptyTrimmedStringSchema(
    "chunk.analysis.ready payload requires chunkId",
  ),
  completedAt: nonEmptyTrimmedStringSchema(
    "chunk.analysis.ready payload requires completedAt",
  ),
  modelVersion: optionalTrimmedStringSchema(
    "chunk.analysis.ready payload requires a non-empty modelVersion when provided",
  ),
});

const condenseContextRequestedPayloadSchema = pipelineArtifactPayloadSchema.extend({
  chunkId: nonEmptyTrimmedStringSchema(
    "condense_context.requested payload requires chunkId",
  ),
  requestedAt: nonEmptyTrimmedStringSchema(
    "condense_context.requested payload requires requestedAt",
  ),
  condensationWindow: z.enum(["rolling", "full-session"]),
});

const contextReadyPayloadSchema = pipelineArtifactPayloadSchema.extend({
  chunkId: nonEmptyTrimmedStringSchema("context.ready payload requires chunkId"),
  completedAt: nonEmptyTrimmedStringSchema(
    "context.ready payload requires completedAt",
  ),
  coversThroughChunkId: optionalTrimmedStringSchema(
    "context.ready payload requires a non-empty coversThroughChunkId when provided",
  ),
});

const sessionFinalizationRequestedPayloadSchema =
  pipelineArtifactPayloadSchema.extend({
    requestedAt: nonEmptyTrimmedStringSchema(
      "session.finalization.requested payload requires requestedAt",
    ),
    requestedBy: z.enum(["user", "recovery"]),
  });

const sessionSummaryRequestedPayloadSchema = pipelineArtifactPayloadSchema.extend({
  requestedAt: nonEmptyTrimmedStringSchema(
    "session.summary.requested payload requires requestedAt",
  ),
});

const sessionSummaryReadyPayloadSchema = pipelineArtifactPayloadSchema.extend({
  completedAt: nonEmptyTrimmedStringSchema(
    "session.summary.ready payload requires completedAt",
  ),
  summaryFormat: z.enum(["markdown", "json"]),
});

const coachingRequestedPayloadSchema = pipelineArtifactPayloadSchema.extend({
  requestedAt: nonEmptyTrimmedStringSchema(
    "coaching.requested payload requires requestedAt",
  ),
});

const coachingReadyPayloadSchema = pipelineArtifactPayloadSchema.extend({
  completedAt: nonEmptyTrimmedStringSchema(
    "coaching.ready payload requires completedAt",
  ),
  coachingFormat: z.enum(["markdown", "json"]),
});

const pipelineFailedPayloadSchema = pipelineArtifactPayloadSchema.extend({
  failedAt: nonEmptyTrimmedStringSchema("pipeline.failed payload requires failedAt"),
  failedStageName: pipelineStageNameSchema,
  errorCode: nonEmptyTrimmedStringSchema(
    "pipeline.failed payload requires errorCode",
  ),
  errorMessage: nonEmptyTrimmedStringSchema(
    "pipeline.failed payload requires errorMessage",
  ),
  attempt: z
    .number()
    .int("pipeline.failed payload requires an integer attempt")
    .nonnegative("pipeline.failed payload requires a non-negative attempt"),
});

export type ChunkRegisteredPayload = z.infer<typeof chunkRegisteredPayloadSchema>;
export type TranscribeChunkRequestedPayload = z.infer<
  typeof transcribeChunkRequestedPayloadSchema
>;
export type TranscriptReadyPayload = z.infer<typeof transcriptReadyPayloadSchema>;
export type ResolveParticipantsRequestedPayload = z.infer<
  typeof resolveParticipantsRequestedPayloadSchema
>;
export type ParticipantsReadyPayload = z.infer<
  typeof participantsReadyPayloadSchema
>;
export type DeriveSignalsRequestedPayload = z.infer<
  typeof deriveSignalsRequestedPayloadSchema
>;
export type SignalsReadyPayload = z.infer<typeof signalsReadyPayloadSchema>;
export type AnnotateQuestionsRequestedPayload = z.infer<
  typeof annotateQuestionsRequestedPayloadSchema
>;
export type QuestionsReadyPayload = z.infer<typeof questionsReadyPayloadSchema>;
export type ScoreInteractionRequestedPayload = z.infer<
  typeof scoreInteractionRequestedPayloadSchema
>;
export type InteractionMetricsReadyPayload = z.infer<
  typeof interactionMetricsReadyPayloadSchema
>;
export type UpdateBaselinesRequestedPayload = z.infer<
  typeof updateBaselinesRequestedPayloadSchema
>;
export type BaselinesReadyPayload = z.infer<typeof baselinesReadyPayloadSchema>;
export type AnalyzeChunkRequestedPayload = z.infer<
  typeof analyzeChunkRequestedPayloadSchema
>;
export type ChunkAnalysisReadyPayload = z.infer<
  typeof chunkAnalysisReadyPayloadSchema
>;
export type CondenseContextRequestedPayload = z.infer<
  typeof condenseContextRequestedPayloadSchema
>;
export type ContextReadyPayload = z.infer<typeof contextReadyPayloadSchema>;
export type SessionFinalizationRequestedPayload = z.infer<
  typeof sessionFinalizationRequestedPayloadSchema
>;
export type SessionSummaryRequestedPayload = z.infer<
  typeof sessionSummaryRequestedPayloadSchema
>;
export type SessionSummaryReadyPayload = z.infer<
  typeof sessionSummaryReadyPayloadSchema
>;
export type CoachingRequestedPayload = z.infer<
  typeof coachingRequestedPayloadSchema
>;
export type CoachingReadyPayload = z.infer<typeof coachingReadyPayloadSchema>;
export type PipelineFailedPayload = z.infer<typeof pipelineFailedPayloadSchema>;

export type PipelinePayloadByEventType = {
  readonly "chunk.registered": ChunkRegisteredPayload;
  readonly "transcribe_chunk.requested": TranscribeChunkRequestedPayload;
  readonly "transcript.ready": TranscriptReadyPayload;
  readonly "resolve_participants.requested": ResolveParticipantsRequestedPayload;
  readonly "participants.ready": ParticipantsReadyPayload;
  readonly "derive_signals.requested": DeriveSignalsRequestedPayload;
  readonly "signals.ready": SignalsReadyPayload;
  readonly "annotate_questions.requested": AnnotateQuestionsRequestedPayload;
  readonly "questions.ready": QuestionsReadyPayload;
  readonly "score_interaction.requested": ScoreInteractionRequestedPayload;
  readonly "interaction.metrics.ready": InteractionMetricsReadyPayload;
  readonly "update_baselines.requested": UpdateBaselinesRequestedPayload;
  readonly "baselines.ready": BaselinesReadyPayload;
  readonly "analyze_chunk.requested": AnalyzeChunkRequestedPayload;
  readonly "chunk.analysis.ready": ChunkAnalysisReadyPayload;
  readonly "condense_context.requested": CondenseContextRequestedPayload;
  readonly "context.ready": ContextReadyPayload;
  readonly "session.finalization.requested": SessionFinalizationRequestedPayload;
  readonly "session.summary.requested": SessionSummaryRequestedPayload;
  readonly "session.summary.ready": SessionSummaryReadyPayload;
  readonly "coaching.requested": CoachingRequestedPayload;
  readonly "coaching.ready": CoachingReadyPayload;
  readonly "pipeline.failed": PipelineFailedPayload;
};

export type PipelinePayload<TEventType extends PipelineEventType> =
  PipelinePayloadByEventType[TEventType];

const pipelineEventEnvelopeInputSchema = z.object({
  eventId: nonEmptyTrimmedStringSchema(
    "pipeline events require a non-empty eventId",
  ),
  eventType: pipelineEventTypeSchema,
  sessionId: nonEmptyTrimmedStringSchema(
    "pipeline events require a non-empty sessionId",
  ),
  chunkId: optionalTrimmedStringSchema(
    "pipeline events require a non-empty chunkId when provided",
  ),
  stageName: pipelineStageNameSchema.optional(),
  causationId: optionalTrimmedStringSchema(
    "pipeline events require a non-empty causationId when provided",
  ),
  correlationId: nonEmptyTrimmedStringSchema(
    "pipeline events require a non-empty correlationId",
  ),
  occurredAt: nonEmptyTrimmedStringSchema(
    "pipeline events require a non-empty occurredAt timestamp",
  ),
});

export type PipelineEventEnvelope<
  TEventType extends PipelineEventType = PipelineEventType,
> = {
  readonly eventId: string;
  readonly eventType: TEventType;
  readonly schemaVersion: typeof PIPELINE_EVENT_SCHEMA_VERSION;
  readonly sessionId: string;
  readonly chunkId?: string;
  readonly stageName?: PipelineStageName;
  readonly causationId?: string;
  readonly correlationId: string;
  readonly occurredAt: string;
  readonly payload: PipelinePayload<TEventType>;
  readonly payloadSchemaVersion: number;
};

const pipelineStageRunStatusSchema = z.enum(PIPELINE_STAGE_RUN_STATUSES);
const pipelineStageRunSchema = z.object({
  runId: nonEmptyTrimmedStringSchema(
    "pipeline stage runs require a non-empty runId",
  ),
  eventId: nonEmptyTrimmedStringSchema(
    "pipeline stage runs require a non-empty eventId",
  ),
  sessionId: nonEmptyTrimmedStringSchema(
    "pipeline stage runs require a non-empty sessionId",
  ),
  chunkId: optionalTrimmedStringSchema(
    "pipeline stage runs require a non-empty chunkId when provided",
  ),
  stageName: pipelineExecutableStageNameSchema,
  status: pipelineStageRunStatusSchema,
  attempt: z
    .number()
    .int("pipeline stage runs require an integer attempt")
    .nonnegative("pipeline stage runs require a non-negative attempt"),
  leasedUntil: optionalTrimmedStringSchema(
    "pipeline stage runs require a non-empty leasedUntil when provided",
  ),
  inputArtifacts: pipelineArtifactArraySchema,
  outputArtifacts: pipelineArtifactArraySchema,
  errorCode: optionalTrimmedStringSchema(
    "pipeline stage runs require a non-empty errorCode when provided",
  ),
  errorMessage: optionalTrimmedStringSchema(
    "pipeline stage runs require a non-empty errorMessage when provided",
  ),
  queuedAt: nonEmptyTrimmedStringSchema(
    "pipeline stage runs require a non-empty queuedAt timestamp",
  ),
  startedAt: optionalTrimmedStringSchema(
    "pipeline stage runs require a non-empty startedAt when provided",
  ),
  completedAt: optionalTrimmedStringSchema(
    "pipeline stage runs require a non-empty completedAt when provided",
  ),
  updatedAt: nonEmptyTrimmedStringSchema(
    "pipeline stage runs require a non-empty updatedAt timestamp",
  ),
});

export type PipelineStageRunRecord<
  TStageName extends PipelineExecutableStageName = PipelineExecutableStageName,
> = Omit<z.infer<typeof pipelineStageRunSchema>, "stageName"> & {
  readonly stageName: TStageName;
};

export type PipelineArtifactHandoffRule = {
  readonly requiresChunkId: boolean;
  readonly requiredInputKinds: readonly PipelineArtifactKind[];
  readonly allowedInputKinds: readonly PipelineArtifactKind[];
  readonly requiredOutputKinds: readonly PipelineArtifactKind[];
  readonly allowedOutputKinds: readonly PipelineArtifactKind[];
};

export const PIPELINE_PAYLOAD_SCHEMA_VERSIONS: Readonly<
  Record<PipelineEventType, number>
> = {
  "chunk.registered": 1,
  "transcribe_chunk.requested": 1,
  "transcript.ready": 1,
  "resolve_participants.requested": 1,
  "participants.ready": 1,
  "derive_signals.requested": 1,
  "signals.ready": 1,
  "annotate_questions.requested": 1,
  "questions.ready": 1,
  "score_interaction.requested": 1,
  "interaction.metrics.ready": 1,
  "update_baselines.requested": 1,
  "baselines.ready": 1,
  "analyze_chunk.requested": 1,
  "chunk.analysis.ready": 1,
  "condense_context.requested": 1,
  "context.ready": 1,
  "session.finalization.requested": 1,
  "session.summary.requested": 1,
  "session.summary.ready": 1,
  "coaching.requested": 1,
  "coaching.ready": 1,
  "pipeline.failed": 1,
};

export const PIPELINE_PAYLOAD_SCHEMAS: {
  readonly [TEventType in PipelineEventType]: z.ZodType<PipelinePayload<TEventType>>;
} = {
  "chunk.registered": chunkRegisteredPayloadSchema,
  "transcribe_chunk.requested": transcribeChunkRequestedPayloadSchema,
  "transcript.ready": transcriptReadyPayloadSchema,
  "resolve_participants.requested": resolveParticipantsRequestedPayloadSchema,
  "participants.ready": participantsReadyPayloadSchema,
  "derive_signals.requested": deriveSignalsRequestedPayloadSchema,
  "signals.ready": signalsReadyPayloadSchema,
  "annotate_questions.requested": annotateQuestionsRequestedPayloadSchema,
  "questions.ready": questionsReadyPayloadSchema,
  "score_interaction.requested": scoreInteractionRequestedPayloadSchema,
  "interaction.metrics.ready": interactionMetricsReadyPayloadSchema,
  "update_baselines.requested": updateBaselinesRequestedPayloadSchema,
  "baselines.ready": baselinesReadyPayloadSchema,
  "analyze_chunk.requested": analyzeChunkRequestedPayloadSchema,
  "chunk.analysis.ready": chunkAnalysisReadyPayloadSchema,
  "condense_context.requested": condenseContextRequestedPayloadSchema,
  "context.ready": contextReadyPayloadSchema,
  "session.finalization.requested": sessionFinalizationRequestedPayloadSchema,
  "session.summary.requested": sessionSummaryRequestedPayloadSchema,
  "session.summary.ready": sessionSummaryReadyPayloadSchema,
  "coaching.requested": coachingRequestedPayloadSchema,
  "coaching.ready": coachingReadyPayloadSchema,
  "pipeline.failed": pipelineFailedPayloadSchema,
};

export const PIPELINE_ARTIFACT_HANDOFF_RULES: Readonly<
  Record<PipelineEventType, PipelineArtifactHandoffRule>
> = {
  "chunk.registered": {
    requiresChunkId: true,
    requiredInputKinds: [],
    allowedInputKinds: [],
    requiredOutputKinds: ["media-chunk"],
    allowedOutputKinds: ["media-chunk"],
  },
  "transcribe_chunk.requested": {
    requiresChunkId: true,
    requiredInputKinds: ["media-chunk"],
    allowedInputKinds: ["media-chunk"],
    requiredOutputKinds: [],
    allowedOutputKinds: [],
  },
  "transcript.ready": {
    requiresChunkId: true,
    requiredInputKinds: ["media-chunk"],
    allowedInputKinds: ["media-chunk"],
    requiredOutputKinds: ["transcript"],
    allowedOutputKinds: ["transcript"],
  },
  "resolve_participants.requested": {
    requiresChunkId: true,
    requiredInputKinds: ["transcript"],
    allowedInputKinds: ["transcript"],
    requiredOutputKinds: [],
    allowedOutputKinds: [],
  },
  "participants.ready": {
    requiresChunkId: true,
    requiredInputKinds: ["transcript"],
    allowedInputKinds: ["transcript"],
    requiredOutputKinds: ["participant-set"],
    allowedOutputKinds: ["participant-set"],
  },
  "derive_signals.requested": {
    requiresChunkId: true,
    requiredInputKinds: ["transcript", "participant-set"],
    allowedInputKinds: ["transcript", "participant-set"],
    requiredOutputKinds: [],
    allowedOutputKinds: [],
  },
  "signals.ready": {
    requiresChunkId: true,
    requiredInputKinds: ["transcript", "participant-set"],
    allowedInputKinds: ["transcript", "participant-set"],
    requiredOutputKinds: ["signal-set"],
    allowedOutputKinds: ["signal-set"],
  },
  "annotate_questions.requested": {
    requiresChunkId: true,
    requiredInputKinds: ["transcript", "participant-set", "signal-set"],
    allowedInputKinds: ["transcript", "participant-set", "signal-set"],
    requiredOutputKinds: [],
    allowedOutputKinds: [],
  },
  "questions.ready": {
    requiresChunkId: true,
    requiredInputKinds: ["transcript", "participant-set", "signal-set"],
    allowedInputKinds: ["transcript", "participant-set", "signal-set"],
    requiredOutputKinds: ["question-set"],
    allowedOutputKinds: ["question-set"],
  },
  "score_interaction.requested": {
    requiresChunkId: true,
    requiredInputKinds: [
      "transcript",
      "participant-set",
      "signal-set",
      "question-set",
    ],
    allowedInputKinds: [
      "transcript",
      "participant-set",
      "signal-set",
      "question-set",
    ],
    requiredOutputKinds: [],
    allowedOutputKinds: [],
  },
  "interaction.metrics.ready": {
    requiresChunkId: true,
    requiredInputKinds: [
      "transcript",
      "participant-set",
      "signal-set",
      "question-set",
    ],
    allowedInputKinds: [
      "transcript",
      "participant-set",
      "signal-set",
      "question-set",
    ],
    requiredOutputKinds: ["interaction-metrics"],
    allowedOutputKinds: ["interaction-metrics"],
  },
  "update_baselines.requested": {
    requiresChunkId: true,
    requiredInputKinds: ["participant-set", "question-set", "interaction-metrics"],
    allowedInputKinds: [
      "transcript",
      "participant-set",
      "signal-set",
      "question-set",
      "interaction-metrics",
    ],
    requiredOutputKinds: [],
    allowedOutputKinds: [],
  },
  "baselines.ready": {
    requiresChunkId: true,
    requiredInputKinds: ["participant-set", "question-set", "interaction-metrics"],
    allowedInputKinds: [
      "transcript",
      "participant-set",
      "signal-set",
      "question-set",
      "interaction-metrics",
    ],
    requiredOutputKinds: ["participant-baseline"],
    allowedOutputKinds: ["participant-baseline"],
  },
  "analyze_chunk.requested": {
    requiresChunkId: true,
    requiredInputKinds: [
      "transcript",
      "participant-set",
      "signal-set",
      "question-set",
      "interaction-metrics",
      "participant-baseline",
    ],
    allowedInputKinds: [
      "transcript",
      "participant-set",
      "signal-set",
      "question-set",
      "interaction-metrics",
      "participant-baseline",
    ],
    requiredOutputKinds: [],
    allowedOutputKinds: [],
  },
  "chunk.analysis.ready": {
    requiresChunkId: true,
    requiredInputKinds: [
      "transcript",
      "participant-set",
      "signal-set",
      "question-set",
      "interaction-metrics",
      "participant-baseline",
    ],
    allowedInputKinds: [
      "transcript",
      "participant-set",
      "signal-set",
      "question-set",
      "interaction-metrics",
      "participant-baseline",
    ],
    requiredOutputKinds: ["chunk-analysis"],
    allowedOutputKinds: ["chunk-analysis"],
  },
  "condense_context.requested": {
    requiresChunkId: true,
    requiredInputKinds: [
      "transcript",
      "participant-set",
      "signal-set",
      "question-set",
      "interaction-metrics",
      "participant-baseline",
      "chunk-analysis",
    ],
    allowedInputKinds: [
      "transcript",
      "participant-set",
      "signal-set",
      "question-set",
      "interaction-metrics",
      "participant-baseline",
      "chunk-analysis",
      "context-summary",
    ],
    requiredOutputKinds: [],
    allowedOutputKinds: [],
  },
  "context.ready": {
    requiresChunkId: true,
    requiredInputKinds: [
      "transcript",
      "participant-set",
      "signal-set",
      "question-set",
      "interaction-metrics",
      "participant-baseline",
      "chunk-analysis",
    ],
    allowedInputKinds: [
      "transcript",
      "participant-set",
      "signal-set",
      "question-set",
      "interaction-metrics",
      "participant-baseline",
      "chunk-analysis",
      "context-summary",
    ],
    requiredOutputKinds: ["context-summary"],
    allowedOutputKinds: ["context-summary"],
  },
  "session.finalization.requested": {
    requiresChunkId: false,
    requiredInputKinds: [],
    allowedInputKinds: [
      "transcript",
      "participant-set",
      "question-set",
      "interaction-metrics",
      "participant-baseline",
      "chunk-analysis",
      "context-summary",
    ],
    requiredOutputKinds: [],
    allowedOutputKinds: [],
  },
  "session.summary.requested": {
    requiresChunkId: false,
    requiredInputKinds: [],
    allowedInputKinds: [
      "transcript",
      "participant-set",
      "question-set",
      "interaction-metrics",
      "participant-baseline",
      "chunk-analysis",
      "context-summary",
    ],
    requiredOutputKinds: [],
    allowedOutputKinds: [],
  },
  "session.summary.ready": {
    requiresChunkId: false,
    requiredInputKinds: [],
    allowedInputKinds: [
      "transcript",
      "participant-set",
      "question-set",
      "interaction-metrics",
      "participant-baseline",
      "chunk-analysis",
      "context-summary",
    ],
    requiredOutputKinds: ["session-summary"],
    allowedOutputKinds: ["session-summary"],
  },
  "coaching.requested": {
    requiresChunkId: false,
    requiredInputKinds: ["session-summary"],
    allowedInputKinds: [
      "session-summary",
      "context-summary",
      "interaction-metrics",
      "participant-baseline",
      "chunk-analysis",
      "question-set",
    ],
    requiredOutputKinds: [],
    allowedOutputKinds: [],
  },
  "coaching.ready": {
    requiresChunkId: false,
    requiredInputKinds: ["session-summary"],
    allowedInputKinds: [
      "session-summary",
      "context-summary",
      "interaction-metrics",
      "participant-baseline",
      "chunk-analysis",
      "question-set",
    ],
    requiredOutputKinds: ["coaching-feedback"],
    allowedOutputKinds: ["coaching-feedback"],
  },
  "pipeline.failed": {
    requiresChunkId: false,
    requiredInputKinds: [],
    allowedInputKinds: PIPELINE_ARTIFACT_KINDS,
    requiredOutputKinds: [],
    allowedOutputKinds: [],
  },
};

export type CreatePipelineEventEnvelopeInput<
  TEventType extends PipelineEventType,
> = {
  readonly eventId: string;
  readonly eventType: TEventType;
  readonly sessionId: string;
  readonly chunkId?: string;
  readonly stageName?: PipelineStageName;
  readonly causationId?: string;
  readonly correlationId: string;
  readonly occurredAt: string;
  readonly payload: PipelinePayload<TEventType>;
};

function parseWithSchema<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  value: unknown,
  scope: string,
): z.infer<TSchema> {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw toPipelineValidationError(scope, result.error);
  }

  return result.data;
}

function dedupeKinds(
  kinds: readonly PipelineArtifactKind[],
): readonly PipelineArtifactKind[] {
  return [...new Set(kinds)];
}

function collectArtifactKinds(
  artifacts: readonly PipelineArtifactRef[],
): readonly PipelineArtifactKind[] {
  return dedupeKinds(artifacts.map((artifact) => artifact.artifactKind));
}

function ensureAllowedArtifactKinds(
  fieldName: string,
  actualKinds: readonly PipelineArtifactKind[],
  allowedKinds: readonly PipelineArtifactKind[],
): void {
  const unsupportedKinds = actualKinds.filter(
    (artifactKind) => !allowedKinds.includes(artifactKind),
  );

  if (unsupportedKinds.length > 0) {
    throw createUnsupportedArtifactKindsError(fieldName, unsupportedKinds);
  }
}

function ensureRequiredArtifactKinds(
  fieldName: string,
  actualKinds: readonly PipelineArtifactKind[],
  requiredKinds: readonly PipelineArtifactKind[],
): void {
  const missingKinds = requiredKinds.filter(
    (artifactKind) => !actualKinds.includes(artifactKind),
  );

  if (missingKinds.length > 0) {
    throw createMissingArtifactKindsError(fieldName, missingKinds);
  }
}

export function normalizePipelineArtifactPath(relativePath: string): string {
  return parseWithSchema(
    pipelineArtifactPathSchema,
    relativePath,
    "pipeline artifact path",
  );
}

export function normalizePipelineArtifactRef<
  TArtifactKind extends PipelineArtifactKind,
>(
  artifact: PipelineArtifactRef<TArtifactKind>,
): PipelineArtifactRef<TArtifactKind> {
  return parseWithSchema(
    pipelineArtifactRefSchema,
    artifact,
    "pipeline artifact",
  ) as PipelineArtifactRef<TArtifactKind>;
}

export function normalizePipelineArtifacts(
  artifacts: readonly PipelineArtifactRef[],
): readonly PipelineArtifactRef[] {
  return parseWithSchema(
    pipelineArtifactArraySchema,
    artifacts,
    "pipeline artifacts",
  );
}

export function isPipelineExecutableStageName(
  stageName: PipelineStageName,
): stageName is PipelineExecutableStageName {
  return PIPELINE_EXECUTABLE_STAGE_NAMES.includes(
    stageName as PipelineExecutableStageName,
  );
}

export function normalizePipelineStageRun<
  TStageName extends PipelineExecutableStageName,
>(
  stageRun: PipelineStageRunRecord<TStageName>,
): PipelineStageRunRecord<TStageName> {
  return parseWithSchema(
    pipelineStageRunSchema,
    stageRun,
    "pipeline stage run",
  ) as PipelineStageRunRecord<TStageName>;
}

export type CreatePipelineEventEnvelopeOptions = {
  /**
   * When true, skips `PIPELINE_ARTIFACT_HANDOFF_RULES` checks after parsing the payload.
   * Use when rehydrating events from durable storage: older rows may not satisfy rules
   * that were tightened after the event was persisted.
   */
  readonly skipArtifactHandoffValidation?: boolean;
};

export function createPipelineEventEnvelope<
  TEventType extends PipelineEventType,
>(
  input: CreatePipelineEventEnvelopeInput<TEventType>,
  options?: CreatePipelineEventEnvelopeOptions,
): PipelineEventEnvelope<TEventType> {
  const normalizedInput = parseWithSchema(
    pipelineEventEnvelopeInputSchema,
    input,
    "pipeline event",
  );
  const payload = parseWithSchema(
    PIPELINE_PAYLOAD_SCHEMAS[normalizedInput.eventType],
    input.payload,
    `${normalizedInput.eventType} payload`,
  ) as PipelinePayload<TEventType>;
  const handoffRule = PIPELINE_ARTIFACT_HANDOFF_RULES[normalizedInput.eventType];

  if (handoffRule.requiresChunkId && normalizedInput.chunkId === undefined) {
    throw createMissingChunkIdError(normalizedInput.eventType);
  }

  const inputArtifactKinds = collectArtifactKinds(payload.inputArtifacts);
  const outputArtifactKinds = collectArtifactKinds(payload.outputArtifacts);

  if (!options?.skipArtifactHandoffValidation) {
    ensureAllowedArtifactKinds(
      `${normalizedInput.eventType} inputArtifacts`,
      inputArtifactKinds,
      handoffRule.allowedInputKinds,
    );
    ensureRequiredArtifactKinds(
      `${normalizedInput.eventType} inputArtifacts`,
      inputArtifactKinds,
      handoffRule.requiredInputKinds,
    );
    ensureAllowedArtifactKinds(
      `${normalizedInput.eventType} outputArtifacts`,
      outputArtifactKinds,
      handoffRule.allowedOutputKinds,
    );
    ensureRequiredArtifactKinds(
      `${normalizedInput.eventType} outputArtifacts`,
      outputArtifactKinds,
      handoffRule.requiredOutputKinds,
    );
  }

  return {
    eventId: normalizedInput.eventId,
    eventType: normalizedInput.eventType as TEventType,
    schemaVersion: PIPELINE_EVENT_SCHEMA_VERSION,
    sessionId: normalizedInput.sessionId,
    chunkId: normalizedInput.chunkId,
    stageName: normalizedInput.stageName ?? normalizedInput.eventType,
    causationId: normalizedInput.causationId,
    correlationId: normalizedInput.correlationId,
    occurredAt: normalizedInput.occurredAt,
    payload,
    payloadSchemaVersion: PIPELINE_PAYLOAD_SCHEMA_VERSIONS[normalizedInput.eventType],
  };
}
