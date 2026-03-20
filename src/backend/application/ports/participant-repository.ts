import type { ParticipantBaselineEntity } from "../../domain/participant/participant-baseline";
import type { ParticipantEntity, ParticipantRole } from "../../domain/participant/participant";
import type { ParticipantPresenceEntity } from "../../domain/participant/participant-presence";

export type ParticipantRepository = {
  findById(participantId: string): Promise<ParticipantEntity | null>;
  findPrimaryCandidate(sessionId: string): Promise<ParticipantEntity | null>;
  listBySessionId(sessionId: string): Promise<readonly ParticipantEntity[]>;
  listBySessionIdAndRoles(
    sessionId: string,
    roles: readonly ParticipantRole[],
  ): Promise<readonly ParticipantEntity[]>;
  save(participant: ParticipantEntity): Promise<void>;
};

export type ParticipantPresenceRepository = {
  listByParticipantId(
    participantId: string,
  ): Promise<readonly ParticipantPresenceEntity[]>;
  listBySessionId(sessionId: string): Promise<readonly ParticipantPresenceEntity[]>;
  save(presence: ParticipantPresenceEntity): Promise<void>;
};

export type ParticipantBaselineRepository = {
  findLatestByParticipantIdAndScope(input: {
    readonly participantId: string;
    readonly scope: ParticipantBaselineEntity["scope"];
  }): Promise<ParticipantBaselineEntity | null>;
  listByParticipantId(
    participantId: string,
  ): Promise<readonly ParticipantBaselineEntity[]>;
  listBySessionId(sessionId: string): Promise<readonly ParticipantBaselineEntity[]>;
  save(baseline: ParticipantBaselineEntity): Promise<void>;
};
