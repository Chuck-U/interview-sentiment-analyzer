export const PARTICIPANT_BASELINE_SCOPES = [
  "rolling-session",
  "session",
] as const;

export type ParticipantBaselineScope =
  (typeof PARTICIPANT_BASELINE_SCOPES)[number];

export type ParticipantBaselineEntity = {
  readonly id: string;
  readonly sessionId: string;
  readonly participantId: string;
  readonly scope: ParticipantBaselineScope;
  readonly featureSetVersion: string;
  readonly windowStartAt: string;
  readonly windowEndAt: string;
  readonly sampleCount: number;
  readonly baseline: Record<string, unknown>;
  readonly createdAt: string;
  readonly updatedAt: string;
};
