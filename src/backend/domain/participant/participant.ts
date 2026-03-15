export const PARTICIPANT_ROLES = [
  "unknown",
  "candidate",
  "interviewer",
  "observer",
] as const;

export type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];

export const PARTICIPANT_ASSIGNMENT_SOURCES = [
  "system",
  "heuristic",
  "microphone-alignment",
  "question-behavior",
  "user-confirmed",
] as const;

export type ParticipantAssignmentSource =
  (typeof PARTICIPANT_ASSIGNMENT_SOURCES)[number];

export type ParticipantEvidence = Record<string, unknown>;

export type ParticipantEntity = {
  readonly id: string;
  readonly sessionId: string;
  readonly canonicalLabel: string;
  readonly displayName?: string;
  readonly role: ParticipantRole;
  readonly roleConfidence: number;
  readonly assignmentSource: ParticipantAssignmentSource;
  readonly isPrimaryCandidate: boolean;
  readonly mergedIntoParticipantId?: string;
  readonly evidence: readonly ParticipantEvidence[];
  readonly createdAt: string;
  readonly updatedAt: string;
};
