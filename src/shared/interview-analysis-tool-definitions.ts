import { z } from "zod";

export const INTERVIEW_ANALYSIS_TOOL_SCHEMA_VERSION = 1 as const;

export const INTERVIEW_ANALYSIS_TOOL_NAMES = [
  "measure_interviewer_attention",
  "measure_interviewee_rambling",
  "extract_gradable_interview_task",
] as const;

export type InterviewAnalysisToolName =
  (typeof INTERVIEW_ANALYSIS_TOOL_NAMES)[number];

export const INTERVIEW_QUESTION_TYPES = [
  "behavioral",
  "technical",
  "clarifying",
  "follow-up",
  "introductory",
  "closing",
  "unknown",
] as const;

export const INTERVIEW_EXPECTED_ANSWER_SHAPES = [
  "star",
  "direct",
  "clarification",
  "brainstorming",
  "unknown",
] as const;

type JsonSchema = Readonly<Record<string, unknown>>;

function nonEmptyTrimmedStringSchema(message: string) {
  return z.string().trim().min(1, message);
}

const unitIntervalSchema = z
  .number()
  .min(0, "scores must be at least 0")
  .max(1, "scores must be at most 1");

const evidenceSchema = z.object({
  signal: nonEmptyTrimmedStringSchema("evidence requires a non-empty signal name"),
  quote: nonEmptyTrimmedStringSchema("evidence requires a non-empty quote"),
  rationale: nonEmptyTrimmedStringSchema(
    "evidence requires a non-empty rationale",
  ),
  turnIndexes: z
    .array(z.number().int().nonnegative("turnIndexes must be non-negative"))
    .min(1, "turnIndexes must contain at least one referenced turn")
    .optional(),
});

const transcriptTurnParameterSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    speakerRole: {
      type: "string",
      enum: ["interviewer", "interviewee", "unknown"],
      description: "Role for the speaker who produced this turn.",
    },
    speakerId: {
      type: "string",
      description: "Stable identifier when diarization is available.",
    },
    text: {
      type: "string",
      description: "Verbatim transcript text for the turn.",
    },
    startAtMs: {
      type: "number",
      description: "Optional turn start offset in milliseconds.",
    },
    endAtMs: {
      type: "number",
      description: "Optional turn end offset in milliseconds.",
    },
  },
  required: ["speakerRole", "text"],
} as const satisfies JsonSchema;

export const measureInterviewerAttentionResultSchema = z.object({
  schemaVersion: z.literal(INTERVIEW_ANALYSIS_TOOL_SCHEMA_VERSION),
  attentionScore: unitIntervalSchema,
  attentionBand: z.enum(["low", "mixed", "high"]),
  summary: nonEmptyTrimmedStringSchema(
    "attention measurement requires a non-empty summary",
  ),
  signalScores: z.object({
    listenerResponsiveness: unitIntervalSchema,
    followUpSpecificity: unitIntervalSchema,
    contextCarryForward: unitIntervalSchema,
    interruptionManagement: unitIntervalSchema,
  }),
  evidence: z
    .array(evidenceSchema)
    .min(1, "attention measurement requires at least one evidence item"),
  cautions: z.array(
    nonEmptyTrimmedStringSchema("cautions must be non-empty when provided"),
  ),
});

export type MeasureInterviewerAttentionResult = z.infer<
  typeof measureInterviewerAttentionResultSchema
>;

export const measureIntervieweeRamblingResultSchema = z.object({
  schemaVersion: z.literal(INTERVIEW_ANALYSIS_TOOL_SCHEMA_VERSION),
  ramblingScore: unitIntervalSchema,
  ramblingClass: z.enum([
    "focused",
    "expansive-but-on-topic",
    "circumstantial",
    "tangential",
  ]),
  summary: nonEmptyTrimmedStringSchema(
    "rambling measurement requires a non-empty summary",
  ),
  directAnswer: z
    .string()
    .trim()
    .min(1, "directAnswer must be non-empty when provided")
    .optional(),
  returnedToQuestion: z.boolean(),
  signalScores: z.object({
    directAnswerDelay: unitIntervalSchema,
    topicalDrift: unitIntervalSchema,
    detailOverrun: unitIntervalSchema,
    repetition: unitIntervalSchema,
    recoveryFailure: unitIntervalSchema,
  }),
  evidence: z
    .array(evidenceSchema)
    .min(1, "rambling measurement requires at least one evidence item"),
  coachingCue: nonEmptyTrimmedStringSchema(
    "rambling measurement requires a non-empty coachingCue",
  ),
});

export type MeasureIntervieweeRamblingResult = z.infer<
  typeof measureIntervieweeRamblingResultSchema
>;

export const extractGradableInterviewTaskResultSchema = z.object({
  schemaVersion: z.literal(INTERVIEW_ANALYSIS_TOOL_SCHEMA_VERSION),
  promptText: nonEmptyTrimmedStringSchema(
    "task extraction requires the verbatim promptText",
  ),
  normalizedTask: nonEmptyTrimmedStringSchema(
    "task extraction requires a normalizedTask",
  ),
  questionType: z.enum(INTERVIEW_QUESTION_TYPES),
  expectedAnswerShape: z.enum(INTERVIEW_EXPECTED_ANSWER_SHAPES),
  isMultiPart: z.boolean(),
  gradingFocus: z
    .array(nonEmptyTrimmedStringSchema("gradingFocus items must be non-empty"))
    .min(1, "task extraction requires at least one gradingFocus item"),
  constraints: z.array(
    nonEmptyTrimmedStringSchema("constraints must be non-empty when provided"),
  ),
  ambiguities: z.array(
    nonEmptyTrimmedStringSchema("ambiguities must be non-empty when provided"),
  ),
  confidence: unitIntervalSchema,
  evidence: z
    .array(evidenceSchema)
    .min(1, "task extraction requires at least one evidence item"),
});

export type ExtractGradableInterviewTaskResult = z.infer<
  typeof extractGradableInterviewTaskResultSchema
>;

export type InterviewAnalysisToolDefinition<
  TResultSchema extends z.ZodTypeAny = z.ZodTypeAny,
> = {
  readonly type: "function";
  readonly function: {
    readonly name: InterviewAnalysisToolName;
    readonly description: string;
    readonly strict: true;
    readonly parameters: JsonSchema;
  };
  readonly resultSchemaVersion: typeof INTERVIEW_ANALYSIS_TOOL_SCHEMA_VERSION;
  readonly resultSchema: TResultSchema;
};

// Design note: this tool avoids pretending that "attention" is a hidden mental
// state. It scores observable interviewer behaviors that transcripts can ground:
// backchanneling/listener responses, specific follow-ups, carry-forward of
// candidate details, and interruption discipline.
export const measureInterviewerAttentionToolDefinition: InterviewAnalysisToolDefinition<
  typeof measureInterviewerAttentionResultSchema
> = {
  type: "function",
  function: {
    name: "measure_interviewer_attention",
    description:
      "Estimate interviewer attention from turn-taking, carry-forward, and active-listening signals in an interview transcript slice.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        turns: {
          type: "array",
          minItems: 3,
          description:
            "Ordered transcript turns spanning at least one interviewer prompt and interviewee response.",
          items: transcriptTurnParameterSchema,
        },
        interviewerSpeakerId: {
          type: "string",
          description:
            "Optional diarized speaker id for the interviewer when multiple interviewers are present.",
        },
        intervieweeSpeakerId: {
          type: "string",
          description:
            "Optional diarized speaker id for the interviewee whose answer is being observed.",
        },
        focusQuestion: {
          type: "string",
          description:
            "Optional question or topic label used to keep the measurement anchored to the current exchange.",
        },
      },
      required: ["turns"],
    },
  },
  resultSchemaVersion: INTERVIEW_ANALYSIS_TOOL_SCHEMA_VERSION,
  resultSchema: measureInterviewerAttentionResultSchema,
};

// Design note: rambling is separated into focused, expansive, circumstantial,
// and tangential patterns. That keeps the tool from penalizing detail-rich
// answers that still return to the ask, while still capturing drift, delayed
// directness, and repetitive over-explaining.
export const measureIntervieweeRamblingToolDefinition: InterviewAnalysisToolDefinition<
  typeof measureIntervieweeRamblingResultSchema
> = {
  type: "function",
  function: {
    name: "measure_interviewee_rambling",
    description:
      "Measure whether an interviewee response stays focused, becomes circumstantial, or drifts tangentially away from the ask.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        turns: {
          type: "array",
          minItems: 2,
          description:
            "Ordered transcript turns containing the prompt and the response being evaluated.",
          items: transcriptTurnParameterSchema,
        },
        intervieweeSpeakerId: {
          type: "string",
          description:
            "Optional diarized speaker id for the interviewee when several candidates are present.",
        },
        questionOrTask: {
          type: "string",
          description:
            "Optional prompt text if the question is already known and should be used as the relevance anchor.",
        },
        responseTurnIndexes: {
          type: "array",
          items: {
            type: "integer",
            minimum: 0,
          },
          description:
            "Optional indexes for the interviewee turns that form the candidate answer under review.",
        },
      },
      required: ["turns"],
    },
  },
  resultSchemaVersion: INTERVIEW_ANALYSIS_TOOL_SCHEMA_VERSION,
  resultSchema: measureIntervieweeRamblingResultSchema,
};

// Design note: extracting a gradable prompt should preserve both the verbatim
// interviewer wording and a normalized task statement. The tool therefore keeps
// ambiguities and constraints explicit instead of collapsing them into one
// cleaned sentence that would hide what the candidate was actually asked.
export const extractGradableInterviewTaskToolDefinition: InterviewAnalysisToolDefinition<
  typeof extractGradableInterviewTaskResultSchema
> = {
  type: "function",
  function: {
    name: "extract_gradable_interview_task",
    description:
      "Extract the interview question or task that should anchor grading, along with expected answer shape and grading focus.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        turns: {
          type: "array",
          minItems: 1,
          description:
            "Ordered transcript turns that contain the interviewer ask and nearby context.",
          items: transcriptTurnParameterSchema,
        },
        interviewerSpeakerId: {
          type: "string",
          description:
            "Optional diarized speaker id for the interviewer when multiple speakers may ask questions.",
        },
        intervieweeSpeakerId: {
          type: "string",
          description:
            "Optional diarized speaker id for the interviewee whose answer will later be graded.",
        },
        candidateResponseTurnIndexes: {
          type: "array",
          items: {
            type: "integer",
            minimum: 0,
          },
          description:
            "Optional response turn indexes to help distinguish the actual ask from setup chatter or clarifications.",
        },
      },
      required: ["turns"],
    },
  },
  resultSchemaVersion: INTERVIEW_ANALYSIS_TOOL_SCHEMA_VERSION,
  resultSchema: extractGradableInterviewTaskResultSchema,
};

export const INTERVIEW_ANALYSIS_TOOL_DEFINITIONS = [
  measureInterviewerAttentionToolDefinition,
  measureIntervieweeRamblingToolDefinition,
  extractGradableInterviewTaskToolDefinition,
] as const;

export const INTERVIEW_ANALYSIS_RESULT_SCHEMAS = {
  measure_interviewer_attention: measureInterviewerAttentionResultSchema,
  measure_interviewee_rambling: measureIntervieweeRamblingResultSchema,
  extract_gradable_interview_task: extractGradableInterviewTaskResultSchema,
} as const;
