import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { SQLInputValue } from "node:sqlite";

import type {
  ParticipantBaselineRepository,
  ParticipantPresenceRepository,
  ParticipantRepository,
} from "../../../application/ports/participant-repository";
import type { QuestionAnnotationRepository } from "../../../application/ports/question-annotation-repository";
import type { ParticipantBaselineEntity } from "../../../domain/participant/participant-baseline";
import type { ParticipantEntity, ParticipantRole } from "../../../domain/participant/participant";
import type { ParticipantPresenceEntity } from "../../../domain/participant/participant-presence";
import type { QuestionAnnotationEntity } from "../../../domain/question/question-annotation";
import {
  mapParticipantBaselineEntityToRow,
  mapParticipantBaselineRowToEntity,
  mapParticipantEntityToRow,
  mapParticipantPresenceEntityToRow,
  mapParticipantPresenceRowToEntity,
  mapParticipantRowToEntity,
  mapQuestionAnnotationEntityToRow,
  mapQuestionAnnotationRowToEntity,
  type ParticipantBaselineRow,
  type ParticipantPresenceRow,
  type ParticipantRow,
  type QuestionAnnotationRow,
} from "./participant-analysis-mappers";
import {
  participantBaselineTable,
  participantPresenceTable,
  participantTable,
  questionAnnotationTable,
} from "./schema";
import type { SessionLifecycleDatabase } from "./sqlite-database";

function executeGet<T>(
  database: SessionLifecycleDatabase,
  statementSql: string,
  params: readonly unknown[],
): T | undefined {
  return database.sqlite
    .prepare(statementSql)
    .get(...(params as SQLInputValue[])) as T | undefined;
}

function executeAll<T>(
  database: SessionLifecycleDatabase,
  statementSql: string,
  params: readonly unknown[],
): T[] {
  return database.sqlite
    .prepare(statementSql)
    .all(...(params as SQLInputValue[])) as T[];
}

function executeRun(
  database: SessionLifecycleDatabase,
  statementSql: string,
  params: readonly unknown[],
): void {
  database.sqlite.prepare(statementSql).run(...(params as SQLInputValue[]));
}

export class SqliteParticipantRepository implements ParticipantRepository {
  constructor(private readonly database: SessionLifecycleDatabase) {}

  async findById(participantId: string) {
    const query = this.database.drizzle
      .select()
      .from(participantTable)
      .where(eq(participantTable.id, participantId))
      .toSQL();
    const row = executeGet<ParticipantRow>(this.database, query.sql, query.params);

    return row ? mapParticipantRowToEntity(row) : null;
  }

  async findPrimaryCandidate(sessionId: string) {
    const query = this.database.drizzle
      .select()
      .from(participantTable)
      .where(
        and(
          eq(participantTable.sessionId, sessionId),
          eq(participantTable.isPrimaryCandidate, true),
        ),
      )
      .orderBy(desc(participantTable.roleConfidence), asc(participantTable.createdAt))
      .limit(1)
      .toSQL();
    const row = executeGet<ParticipantRow>(this.database, query.sql, query.params);

    return row ? mapParticipantRowToEntity(row) : null;
  }

  async listBySessionId(sessionId: string) {
    const query = this.database.drizzle
      .select()
      .from(participantTable)
      .where(eq(participantTable.sessionId, sessionId))
      .orderBy(asc(participantTable.createdAt), asc(participantTable.id))
      .toSQL();
    const rows = executeAll<ParticipantRow>(this.database, query.sql, query.params);

    return rows.map((row) => mapParticipantRowToEntity(row));
  }

  async listBySessionIdAndRoles(
    sessionId: string,
    roles: readonly ParticipantRole[],
  ) {
    if (roles.length === 0) {
      return [];
    }

    const query = this.database.drizzle
      .select()
      .from(participantTable)
      .where(
        and(
          eq(participantTable.sessionId, sessionId),
          inArray(participantTable.role, [...roles]),
        ),
      )
      .orderBy(desc(participantTable.roleConfidence), asc(participantTable.createdAt))
      .toSQL();
    const rows = executeAll<ParticipantRow>(this.database, query.sql, query.params);

    return rows.map((row) => mapParticipantRowToEntity(row));
  }

  async save(participant: ParticipantEntity) {
    const row = mapParticipantEntityToRow(participant);
    const query = this.database.drizzle
      .insert(participantTable)
      .values({
        id: row.id,
        sessionId: row.session_id,
        canonicalLabel: row.canonical_label,
        displayName: row.display_name,
        role: row.role,
        roleConfidence: row.role_confidence,
        assignmentSource: row.assignment_source,
        isPrimaryCandidate: participant.isPrimaryCandidate,
        mergedIntoParticipantId: row.merged_into_participant_id,
        evidenceJson: row.evidence_json,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })
      .onConflictDoUpdate({
        target: participantTable.id,
        set: {
          sessionId: row.session_id,
          canonicalLabel: row.canonical_label,
          displayName: row.display_name,
          role: row.role,
          roleConfidence: row.role_confidence,
          assignmentSource: row.assignment_source,
          isPrimaryCandidate: participant.isPrimaryCandidate,
          mergedIntoParticipantId: row.merged_into_participant_id,
          evidenceJson: row.evidence_json,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      })
      .toSQL();

    executeRun(this.database, query.sql, query.params);
  }
}

export class SqliteParticipantPresenceRepository
  implements ParticipantPresenceRepository
{
  constructor(private readonly database: SessionLifecycleDatabase) {}

  async listByParticipantId(participantId: string) {
    const query = this.database.drizzle
      .select()
      .from(participantPresenceTable)
      .where(eq(participantPresenceTable.participantId, participantId))
      .orderBy(asc(participantPresenceTable.joinedAt), asc(participantPresenceTable.id))
      .toSQL();
    const rows = executeAll<ParticipantPresenceRow>(
      this.database,
      query.sql,
      query.params,
    );

    return rows.map((row) => mapParticipantPresenceRowToEntity(row));
  }

  async listBySessionId(sessionId: string) {
    const query = this.database.drizzle
      .select()
      .from(participantPresenceTable)
      .where(eq(participantPresenceTable.sessionId, sessionId))
      .orderBy(asc(participantPresenceTable.joinedAt), asc(participantPresenceTable.id))
      .toSQL();
    const rows = executeAll<ParticipantPresenceRow>(
      this.database,
      query.sql,
      query.params,
    );

    return rows.map((row) => mapParticipantPresenceRowToEntity(row));
  }

  async save(presence: ParticipantPresenceEntity) {
    const row = mapParticipantPresenceEntityToRow(presence);
    const query = this.database.drizzle
      .insert(participantPresenceTable)
      .values({
        id: row.id,
        participantId: row.participant_id,
        sessionId: row.session_id,
        joinedAt: row.joined_at,
        leftAt: row.left_at,
        sourceHint: row.source_hint,
        presenceConfidence: row.presence_confidence,
        evidenceJson: row.evidence_json,
      })
      .onConflictDoUpdate({
        target: participantPresenceTable.id,
        set: {
          participantId: row.participant_id,
          sessionId: row.session_id,
          joinedAt: row.joined_at,
          leftAt: row.left_at,
          sourceHint: row.source_hint,
          presenceConfidence: row.presence_confidence,
          evidenceJson: row.evidence_json,
        },
      })
      .toSQL();

    executeRun(this.database, query.sql, query.params);
  }
}

export class SqliteQuestionAnnotationRepository
  implements QuestionAnnotationRepository
{
  constructor(private readonly database: SessionLifecycleDatabase) {}

  async listByChunkId(chunkId: string) {
    const query = this.database.drizzle
      .select()
      .from(questionAnnotationTable)
      .where(eq(questionAnnotationTable.chunkId, chunkId))
      .orderBy(asc(questionAnnotationTable.startAt), asc(questionAnnotationTable.id))
      .toSQL();
    const rows = executeAll<QuestionAnnotationRow>(
      this.database,
      query.sql,
      query.params,
    );

    return rows.map((row) => mapQuestionAnnotationRowToEntity(row));
  }

  async listBySessionId(sessionId: string) {
    const query = this.database.drizzle
      .select()
      .from(questionAnnotationTable)
      .where(eq(questionAnnotationTable.sessionId, sessionId))
      .orderBy(asc(questionAnnotationTable.startAt), asc(questionAnnotationTable.id))
      .toSQL();
    const rows = executeAll<QuestionAnnotationRow>(
      this.database,
      query.sql,
      query.params,
    );

    return rows.map((row) => mapQuestionAnnotationRowToEntity(row));
  }

  async save(annotation: QuestionAnnotationEntity) {
    const row = mapQuestionAnnotationEntityToRow(annotation);
    const query = this.database.drizzle
      .insert(questionAnnotationTable)
      .values({
        id: row.id,
        sessionId: row.session_id,
        chunkId: row.chunk_id,
        askerParticipantId: row.asker_participant_id,
        addressedToParticipantId: row.addressed_to_participant_id,
        startAt: row.start_at,
        endAt: row.end_at,
        questionText: row.question_text,
        questionType: row.question_type,
        topicTagsJson: row.topic_tags_json,
        ambiguityScore: row.ambiguity_score,
        multiPart: annotation.multiPart,
        expectedAnswerShape: row.expected_answer_shape,
        annotationConfidence: row.annotation_confidence,
        evidenceJson: row.evidence_json,
      })
      .onConflictDoUpdate({
        target: questionAnnotationTable.id,
        set: {
          sessionId: row.session_id,
          chunkId: row.chunk_id,
          askerParticipantId: row.asker_participant_id,
          addressedToParticipantId: row.addressed_to_participant_id,
          startAt: row.start_at,
          endAt: row.end_at,
          questionText: row.question_text,
          questionType: row.question_type,
          topicTagsJson: row.topic_tags_json,
          ambiguityScore: row.ambiguity_score,
          multiPart: annotation.multiPart,
          expectedAnswerShape: row.expected_answer_shape,
          annotationConfidence: row.annotation_confidence,
          evidenceJson: row.evidence_json,
        },
      })
      .toSQL();

    executeRun(this.database, query.sql, query.params);
  }
}

export class SqliteParticipantBaselineRepository
  implements ParticipantBaselineRepository
{
  constructor(private readonly database: SessionLifecycleDatabase) {}

  async findLatestByParticipantIdAndScope(input: {
    readonly participantId: string;
    readonly scope: string;
  }) {
    const query = this.database.drizzle
      .select()
      .from(participantBaselineTable)
      .where(
        and(
          eq(participantBaselineTable.participantId, input.participantId),
          eq(participantBaselineTable.scope, input.scope as ParticipantBaselineRow["scope"]),
        ),
      )
      .orderBy(desc(participantBaselineTable.windowEndAt), desc(participantBaselineTable.createdAt))
      .limit(1)
      .toSQL();
    const row = executeGet<ParticipantBaselineRow>(
      this.database,
      query.sql,
      query.params,
    );

    return row ? mapParticipantBaselineRowToEntity(row) : null;
  }

  async listByParticipantId(participantId: string) {
    const query = this.database.drizzle
      .select()
      .from(participantBaselineTable)
      .where(eq(participantBaselineTable.participantId, participantId))
      .orderBy(
        asc(participantBaselineTable.windowStartAt),
        asc(participantBaselineTable.id),
      )
      .toSQL();
    const rows = executeAll<ParticipantBaselineRow>(
      this.database,
      query.sql,
      query.params,
    );

    return rows.map((row) => mapParticipantBaselineRowToEntity(row));
  }

  async listBySessionId(sessionId: string) {
    const query = this.database.drizzle
      .select()
      .from(participantBaselineTable)
      .where(eq(participantBaselineTable.sessionId, sessionId))
      .orderBy(
        asc(participantBaselineTable.windowStartAt),
        asc(participantBaselineTable.id),
      )
      .toSQL();
    const rows = executeAll<ParticipantBaselineRow>(
      this.database,
      query.sql,
      query.params,
    );

    return rows.map((row) => mapParticipantBaselineRowToEntity(row));
  }

  async save(baseline: ParticipantBaselineEntity) {
    const row = mapParticipantBaselineEntityToRow(baseline);
    const query = this.database.drizzle
      .insert(participantBaselineTable)
      .values({
        id: row.id,
        sessionId: row.session_id,
        participantId: row.participant_id,
        scope: row.scope,
        featureSetVersion: row.feature_set_version,
        windowStartAt: row.window_start_at,
        windowEndAt: row.window_end_at,
        sampleCount: row.sample_count,
        baselineJson: row.baseline_json,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })
      .onConflictDoUpdate({
        target: participantBaselineTable.id,
        set: {
          sessionId: row.session_id,
          participantId: row.participant_id,
          scope: row.scope,
          featureSetVersion: row.feature_set_version,
          windowStartAt: row.window_start_at,
          windowEndAt: row.window_end_at,
          sampleCount: row.sample_count,
          baselineJson: row.baseline_json,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      })
      .toSQL();

    executeRun(this.database, query.sql, query.params);
  }
}
