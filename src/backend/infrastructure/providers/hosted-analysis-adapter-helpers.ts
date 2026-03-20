import type {
  HostedAnalysisArtifactInput,
  HostedAnalysisEvidenceRef,
  HostedAnalysisMetadata,
  HostedAnalysisProviderName,
  HostedAnalysisTaskRequest,
  HostedChunkAnalysisOutput,
  HostedCoachingOutput,
  HostedContextSummaryOutput,
  HostedSessionSummaryOutput,
} from "../../application/ports/analysis-provider";

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function summarizeArtifact(artifact: HostedAnalysisArtifactInput): string {
  const normalizedContent = normalizeWhitespace(artifact.content);

  if (normalizedContent.length === 0) {
    return `${artifact.artifact.artifactKind} ${artifact.artifact.artifactId}`;
  }

  return truncate(normalizedContent, 120);
}

export function createHostedAnalysisEvidence(
  artifacts: readonly HostedAnalysisArtifactInput[],
  rationale: string,
): readonly HostedAnalysisEvidenceRef[] {
  return artifacts.slice(0, 2).map((artifact) => ({
    artifactId: artifact.artifact.artifactId,
    quote: summarizeArtifact(artifact),
    rationale,
  }));
}

export function createHostedAnalysisMetadata(input: {
  readonly provider: HostedAnalysisProviderName;
  readonly model: string;
  readonly promptVersion: string;
  readonly schemaVersion: number;
  readonly request: HostedAnalysisTaskRequest;
  readonly estimatedCostUsd?: number;
  readonly rawResponseRef?: string;
}): HostedAnalysisMetadata {
  const inputSize = input.request.artifacts.reduce(
    (total, artifact) => total + artifact.content.length,
    0,
  );
  const inputTokens = Math.max(
    64,
    Math.ceil((inputSize + input.request.stageName.length * 24) / 4),
  );
  const outputTokens = Math.max(96, Math.ceil(inputTokens * 0.35));

  return {
    provider: input.provider,
    model: input.model,
    promptVersion: input.promptVersion,
    schemaVersion: input.schemaVersion,
    usage: {
      inputTokens,
      outputTokens,
    },
    latencyMs: 900 + input.request.artifacts.length * 125,
    estimatedCostUsd: input.estimatedCostUsd,
    rawResponseRef: input.rawResponseRef,
  };
}

function collectArtifactKinds(
  artifacts: readonly HostedAnalysisArtifactInput[],
): readonly string[] {
  return artifacts.map((artifact) => artifact.artifact.artifactKind);
}

export function createChunkAnalysisOutput(input: {
  readonly providerLabel: string;
  readonly request: HostedAnalysisTaskRequest<"analyze_chunk.requested">;
}): HostedChunkAnalysisOutput {
  const evidence = createHostedAnalysisEvidence(
    input.request.artifacts,
    "Derived from normalized chunk inputs and supporting artifacts.",
  );
  const artifactKinds = collectArtifactKinds(input.request.artifacts).join(", ");
  const chunkScope = input.request.chunkId ?? "session scope";

  return {
    schemaVersion: 1,
    overview: `${input.providerLabel} analyzed ${chunkScope} using ${artifactKinds || "no"} supporting artifacts.`,
    strengths: [
      {
        title: "Grounded answer framing",
        summary:
          "Response structure was evaluated against the linked question and baseline context rather than transcript text alone.",
        evidence,
      },
    ],
    issues: [
      {
        title: "Follow-up risk",
        summary:
          "The candidate response may need tighter alignment with interviewer intent when ambiguity or pacing pressure rises.",
        evidence,
      },
    ],
    ambiguities: [
      {
        title: "Question interpretation gap",
        summary:
          "The prompt shape preserves ambiguity as a first-class finding so coaching can distinguish unclear questions from weak answers.",
        evidence,
      },
    ],
    cueMismatches: [
      {
        title: "Turn-taking friction",
        summary:
          "Interaction signals suggest watching for redirect pressure and missed interviewer cues in future synthesis stages.",
        evidence,
      },
    ],
  };
}

export function createContextSummaryOutput(input: {
  readonly providerLabel: string;
  readonly request: HostedAnalysisTaskRequest<"condense_context.requested">;
}): HostedContextSummaryOutput {
  const artifactKinds = collectArtifactKinds(input.request.artifacts);

  return {
    schemaVersion: 1,
    rollingFacts: [
      `${input.providerLabel} condensed ${artifactKinds.length} artifacts into machine-readable rolling context.`,
      "Latest chunk analysis is preserved with provider metadata for downstream retries.",
    ],
    stablePatterns: [
      "Baseline-aware coaching remains anchored to evidence-backed artifacts.",
      "Hosted stages can evolve independently from local extraction stages.",
    ],
    unresolvedThreads: [
      "Confirm whether interviewer ambiguity or candidate drift drove the strongest interaction gaps.",
    ],
    coversThroughChunkId: input.request.chunkId,
  };
}

export function createSessionSummaryOutput(input: {
  readonly providerLabel: string;
  readonly request: HostedAnalysisTaskRequest<"session.summary.requested">;
}): HostedSessionSummaryOutput {
  const evidence = createHostedAnalysisEvidence(
    input.request.artifacts,
    "Selected as representative evidence for the session-level synthesis.",
  );

  return {
    schemaVersion: 1,
    overview:
      "Session synthesis separates question difficulty, interviewer ambiguity, and candidate performance trends.",
    interviewArc: [
      `${input.providerLabel} combined chunk-level evidence into a session narrative.`,
      "Later coaching stages can reference the same normalized evidence without re-parsing raw artifacts.",
    ],
    strengths: [
      "Structured evidence survives retries and provider swaps.",
      "Summary output is JSON-first for reliable downstream consumption.",
    ],
    growthAreas: [
      "Expand evidence selection once real hosted prompts and provider SDK calls are connected.",
    ],
    evidence,
  };
}

export function createCoachingOutput(input: {
  readonly providerLabel: string;
  readonly request: HostedAnalysisTaskRequest<"coaching.requested">;
}): HostedCoachingOutput {
  const evidence = createHostedAnalysisEvidence(
    input.request.artifacts,
    "Chosen to back an actionable coaching recommendation.",
  );

  return {
    schemaVersion: 1,
    summary: `${input.providerLabel} generated evidence-backed coaching priorities from the session summary and supporting artifacts.`,
    priorities: [
      "Tighten answers around the interviewer’s actual ask before adding extra detail.",
      "Watch pacing drift when ambiguity or redirect pressure increases.",
    ],
    drills: [
      "Practice two-sentence direct answers before expanding into examples.",
      "Pause to confirm ambiguous multipart questions before answering.",
    ],
    evidence,
  };
}
