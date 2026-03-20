export type ParticipantPresenceEvidence = Record<string, unknown>;

export type ParticipantPresenceEntity = {
  readonly id: string;
  readonly participantId: string;
  readonly sessionId: string;
  readonly joinedAt: string;
  readonly leftAt?: string;
  readonly sourceHint?: string;
  readonly presenceConfidence: number;
  readonly evidence: readonly ParticipantPresenceEvidence[];
};
