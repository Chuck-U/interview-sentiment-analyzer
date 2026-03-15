import type { ParticipantBaselineEntity } from "../../../domain/participant/participant-baseline";
import type { ParticipantEntity } from "../../../domain/participant/participant";
import type { ParticipantPresenceEntity } from "../../../domain/participant/participant-presence";
import type { QuestionAnnotationEntity } from "../../../domain/question/question-annotation";

export type ParticipantRow = {
  id: string;
  session_id: string;
  canonical_label: string;
  display_name: string | null;
  role: ParticipantEntity["role"];
  role_confidence: number;
  assignment_source: ParticipantEntity["assignmentSource"];
  is_primary_candidate: number | boolean;
  merged_into_participant_id: string | null;
  evidence_json: string;
  created_at: string;
  updated_at: string;
};

export type ParticipantPresenceRow = {
  id: string;
  participant_id: string;
  session_id: string;
  joined_at: string;
  left_at: string | null;
  source_hint: string | null;
  presence_confidence: number;
  evidence_json: string;
};

export type QuestionAnnotationRow = {
  id: string;
  session_id: string;
  chunk_id: string;
  asker_participant_id: string;
  addressed_to_participant_id: string | null;
  start_at: string;
  end_at: string;
  question_text: string;
  question_type: QuestionAnnotationEntity["questionType"];
  topic_tags_json: string;
  ambiguity_score: number;
  multi_part: number | boolean;
  expected_answer_shape: QuestionAnnotationEntity["expectedAnswerShape"];
  annotation_confidence: number;
  evidence_json: string;
};

export type ParticipantBaselineRow = {
  id: string;
  session_id: string;
  participant_id: string;
  scope: ParticipantBaselineEntity["scope"];
  feature_set_version: string;
  window_start_at: string;
  window_end_at: string;
  sample_count: number;
  baseline_json: string;
  created_at: string;
  updated_at: string;
};

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

function toBoolean(value: number | boolean): boolean {
  return value === true || value === 1;
}

export function mapParticipantEntityToRow(
  participant: ParticipantEntity,
): ParticipantRow {
  return {
    id: participant.id,
    session_id: participant.sessionId,
    canonical_label: participant.canonicalLabel,
    display_name: participant.displayName ?? null,
    role: participant.role,
    role_confidence: participant.roleConfidence,
    assignment_source: participant.assignmentSource,
    is_primary_candidate: participant.isPrimaryCandidate,
    merged_into_participant_id: participant.mergedIntoParticipantId ?? null,
    evidence_json: JSON.stringify(participant.evidence),
    created_at: participant.createdAt,
    updated_at: participant.updatedAt,
  };
}

export function mapParticipantRowToEntity(row: ParticipantRow): ParticipantEntity {
  return {
    id: row.id,
    sessionId: row.session_id,
    canonicalLabel: row.canonical_label,
    displayName: row.display_name ?? undefined,
    role: row.role,
    roleConfidence: row.role_confidence,
    assignmentSource: row.assignment_source,
    isPrimaryCandidate: toBoolean(row.is_primary_candidate),
    mergedIntoParticipantId: row.merged_into_participant_id ?? undefined,
    evidence: parseJson<ParticipantEntity["evidence"]>(row.evidence_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapParticipantPresenceEntityToRow(
  presence: ParticipantPresenceEntity,
): ParticipantPresenceRow {
  return {
    id: presence.id,
    participant_id: presence.participantId,
    session_id: presence.sessionId,
    joined_at: presence.joinedAt,
    left_at: presence.leftAt ?? null,
    source_hint: presence.sourceHint ?? null,
    presence_confidence: presence.presenceConfidence,
    evidence_json: JSON.stringify(presence.evidence),
  };
}

export function mapParticipantPresenceRowToEntity(
  row: ParticipantPresenceRow,
): ParticipantPresenceEntity {
  return {
    id: row.id,
    participantId: row.participant_id,
    sessionId: row.session_id,
    joinedAt: row.joined_at,
    leftAt: row.left_at ?? undefined,
    sourceHint: row.source_hint ?? undefined,
    presenceConfidence: row.presence_confidence,
    evidence: parseJson<ParticipantPresenceEntity["evidence"]>(row.evidence_json),
  };
}

export function mapQuestionAnnotationEntityToRow(
  annotation: QuestionAnnotationEntity,
): QuestionAnnotationRow {
  return {
    id: annotation.id,
    session_id: annotation.sessionId,
    chunk_id: annotation.chunkId,
    asker_participant_id: annotation.askerParticipantId,
    addressed_to_participant_id: annotation.addressedToParticipantId ?? null,
    start_at: annotation.startAt,
    end_at: annotation.endAt,
    question_text: annotation.questionText,
    question_type: annotation.questionType,
    topic_tags_json: JSON.stringify(annotation.topicTags),
    ambiguity_score: annotation.ambiguityScore,
    multi_part: annotation.multiPart,
    expected_answer_shape: annotation.expectedAnswerShape,
    annotation_confidence: annotation.annotationConfidence,
    evidence_json: JSON.stringify(annotation.evidence),
  };
}

export function mapQuestionAnnotationRowToEntity(
  row: QuestionAnnotationRow,
): QuestionAnnotationEntity {
  return {
    id: row.id,
    sessionId: row.session_id,
    chunkId: row.chunk_id,
    askerParticipantId: row.asker_participant_id,
    addressedToParticipantId: row.addressed_to_participant_id ?? undefined,
    startAt: row.start_at,
    endAt: row.end_at,
    questionText: row.question_text,
    questionType: row.question_type,
    topicTags: parseJson<QuestionAnnotationEntity["topicTags"]>(row.topic_tags_json),
    ambiguityScore: row.ambiguity_score,
    multiPart: toBoolean(row.multi_part),
    expectedAnswerShape: row.expected_answer_shape,
    annotationConfidence: row.annotation_confidence,
    evidence: parseJson<QuestionAnnotationEntity["evidence"]>(row.evidence_json),
  };
}

export function mapParticipantBaselineEntityToRow(
  baseline: ParticipantBaselineEntity,
): ParticipantBaselineRow {
  return {
    id: baseline.id,
    session_id: baseline.sessionId,
    participant_id: baseline.participantId,
    scope: baseline.scope,
    feature_set_version: baseline.featureSetVersion,
    window_start_at: baseline.windowStartAt,
    window_end_at: baseline.windowEndAt,
    sample_count: baseline.sampleCount,
    baseline_json: JSON.stringify(baseline.baseline),
    created_at: baseline.createdAt,
    updated_at: baseline.updatedAt,
  };
}

export function mapParticipantBaselineRowToEntity(
  row: ParticipantBaselineRow,
): ParticipantBaselineEntity {
  return {
    id: row.id,
    sessionId: row.session_id,
    participantId: row.participant_id,
    scope: row.scope,
    featureSetVersion: row.feature_set_version,
    windowStartAt: row.window_start_at,
    windowEndAt: row.window_end_at,
    sampleCount: row.sample_count,
    baseline: parseJson<ParticipantBaselineEntity["baseline"]>(row.baseline_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
