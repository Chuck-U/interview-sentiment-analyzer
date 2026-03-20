import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { createMediaChunkEntity } from "../domain/capture/media-chunk";
import { createSessionEntity } from "../domain/session/session";
import {
  initializeSessionLifecycleDatabase,
  type SessionLifecycleDatabase,
} from "../infrastructure/persistence/sqlite/sqlite-database";
import {
  SqliteParticipantBaselineRepository,
  SqliteParticipantPresenceRepository,
  SqliteParticipantRepository,
  SqliteQuestionAnnotationRepository,
} from "../infrastructure/persistence/sqlite/sqlite-participant-modeling";
import {
  SqliteMediaChunkRepository,
  SqliteSessionRepository,
} from "../infrastructure/persistence/sqlite/sqlite-session-lifecycle";
import { createSessionStorageLayoutResolver } from "../infrastructure/storage/session-storage-layout";

type ParticipantModelingContext = {
  readonly appDataRoot: string;
  readonly cleanup: () => Promise<void>;
  readonly database: SessionLifecycleDatabase;
  readonly mediaChunkRepository: SqliteMediaChunkRepository;
  readonly participantBaselineRepository: SqliteParticipantBaselineRepository;
  readonly participantPresenceRepository: SqliteParticipantPresenceRepository;
  readonly participantRepository: SqliteParticipantRepository;
  readonly questionAnnotationRepository: SqliteQuestionAnnotationRepository;
  readonly sessionRepository: SqliteSessionRepository;
  readonly sqlite: DatabaseSync;
};

async function createParticipantModelingContext(
  appDataRoot?: string,
): Promise<ParticipantModelingContext> {
  const root = await mkdtemp(path.join(tmpdir(), "interview-sentiment-analyzer-"));
  const resolvedAppDataRoot = appDataRoot ?? path.join(root, "app-data");
  await mkdir(resolvedAppDataRoot, { recursive: true });
  const resolvedDatabasePath = path.join(
    resolvedAppDataRoot,
    "session-lifecycle.sqlite",
  );
  const sqlite = new DatabaseSync(resolvedDatabasePath);
  const database = initializeSessionLifecycleDatabase(sqlite);
  const storageLayoutResolver =
    createSessionStorageLayoutResolver(resolvedAppDataRoot);

  return {
    appDataRoot: resolvedAppDataRoot,
    cleanup: async () => {
      sqlite.close();
      if (appDataRoot === undefined) {
        await rm(root, { force: true, recursive: true });
      }
    },
    database,
    mediaChunkRepository: new SqliteMediaChunkRepository(database),
    participantBaselineRepository: new SqliteParticipantBaselineRepository(
      database,
    ),
    participantPresenceRepository: new SqliteParticipantPresenceRepository(
      database,
    ),
    participantRepository: new SqliteParticipantRepository(database),
    questionAnnotationRepository: new SqliteQuestionAnnotationRepository(database),
    sessionRepository: new SqliteSessionRepository(database, storageLayoutResolver),
    sqlite,
  };
}

async function seedSessionGraph(context: ParticipantModelingContext): Promise<void> {
  const storageLayout = createSessionStorageLayoutResolver(
    context.appDataRoot,
  ).resolveSessionLayout("session-model");

  await context.sessionRepository.save(
    createSessionEntity({
      id: "session-model",
      captureSources: ["microphone"],
      startedAt: "2026-03-10T12:00:00.000Z",
      updatedAt: "2026-03-10T12:00:00.000Z",
      storageLayout,
    }),
  );
  await context.mediaChunkRepository.save(
    createMediaChunkEntity({
      id: "chunk-model",
      sessionId: "session-model",
      source: "microphone",
      relativePath: "chunks/audio/chunk-model.wav",
      recordedAt: "2026-03-10T12:00:01.000Z",
      byteSize: 128,
      createdAt: "2026-03-10T12:00:02.000Z",
    }),
  );
  await context.participantRepository.save({
    id: "participant-candidate",
    sessionId: "session-model",
    canonicalLabel: "speaker_a",
    displayName: "Candidate",
    role: "candidate",
    roleConfidence: 0.91,
    assignmentSource: "microphone-alignment",
    isPrimaryCandidate: true,
    evidence: [{ kind: "microphone-alignment", confidence: 0.91 }],
    createdAt: "2026-03-10T12:00:03.000Z",
    updatedAt: "2026-03-10T12:00:03.000Z",
  });
  await context.participantRepository.save({
    id: "participant-interviewer",
    sessionId: "session-model",
    canonicalLabel: "speaker_b",
    displayName: "Interviewer",
    role: "interviewer",
    roleConfidence: 0.82,
    assignmentSource: "question-behavior",
    isPrimaryCandidate: false,
    evidence: [{ kind: "question-behavior", confidence: 0.82 }],
    createdAt: "2026-03-10T12:00:10.000Z",
    updatedAt: "2026-03-10T12:00:10.000Z",
  });
  await context.participantPresenceRepository.save({
    id: "presence-interviewer",
    participantId: "participant-interviewer",
    sessionId: "session-model",
    joinedAt: "2026-03-10T12:00:15.000Z",
    sourceHint: "late-join",
    presenceConfidence: 0.77,
    evidence: [{ kind: "voice-join", at: "2026-03-10T12:00:15.000Z" }],
  });
  await context.questionAnnotationRepository.save({
    id: "question-1",
    sessionId: "session-model",
    chunkId: "chunk-model",
    askerParticipantId: "participant-interviewer",
    addressedToParticipantId: "participant-candidate",
    startAt: "2026-03-10T12:00:20.000Z",
    endAt: "2026-03-10T12:00:28.000Z",
    questionText: "Tell me about a time you handled ambiguity.",
    questionType: "behavioral",
    topicTags: ["ambiguity", "ownership"],
    ambiguityScore: 0.3,
    multiPart: false,
    expectedAnswerShape: "star",
    annotationConfidence: 0.86,
    evidence: [{ kind: "transcript-span", chunkId: "chunk-model" }],
  });
  await context.participantBaselineRepository.save({
    id: "baseline-candidate",
    sessionId: "session-model",
    participantId: "participant-candidate",
    scope: "rolling-session",
    featureSetVersion: "v1",
    windowStartAt: "2026-03-10T12:00:00.000Z",
    windowEndAt: "2026-03-10T12:00:30.000Z",
    sampleCount: 2,
    baseline: {
      pacing: {
        responseLatencyMs: 840,
      },
    },
    createdAt: "2026-03-10T12:00:31.000Z",
    updatedAt: "2026-03-10T12:00:31.000Z",
  });
}

test("participant modeling repositories persist durable records across restart", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "interview-sentiment-analyzer-"));
  const appDataRoot = path.join(root, "app-data");

  await mkdir(appDataRoot, { recursive: true });

  const initialContext = await createParticipantModelingContext(appDataRoot);

  try {
    await seedSessionGraph(initialContext);
  } finally {
    initialContext.sqlite.close();
  }

  const restartedContext = await createParticipantModelingContext(appDataRoot);

  try {
    const primaryCandidate =
      await restartedContext.participantRepository.findPrimaryCandidate(
        "session-model",
      );
    const interviewerPresence =
      await restartedContext.participantPresenceRepository.listByParticipantId(
        "participant-interviewer",
      );
    const questionAnnotations =
      await restartedContext.questionAnnotationRepository.listByChunkId(
        "chunk-model",
      );
    const latestBaseline =
      await restartedContext.participantBaselineRepository.findLatestByParticipantIdAndScope(
        {
          participantId: "participant-candidate",
          scope: "rolling-session",
        },
      );
    const baselinePacing = latestBaseline?.baseline["pacing"] as
      | { readonly responseLatencyMs?: number }
      | undefined;

    assert.equal(primaryCandidate?.id, "participant-candidate");
    assert.equal(interviewerPresence.length, 1);
    assert.equal(
      questionAnnotations[0]?.questionText,
      "Tell me about a time you handled ambiguity.",
    );
    assert.equal(baselinePacing?.responseLatencyMs, 840);
  } finally {
    await restartedContext.cleanup();
    await rm(root, { force: true, recursive: true });
  }
});

test("participant modeling repositories support session, role, chunk, and scope queries", async () => {
  const context = await createParticipantModelingContext();

  try {
    await seedSessionGraph(context);

    const sessionParticipants = await context.participantRepository.listBySessionId(
      "session-model",
    );
    const interviewers =
      await context.participantRepository.listBySessionIdAndRoles("session-model", [
        "interviewer",
      ]);
    const sessionPresences =
      await context.participantPresenceRepository.listBySessionId("session-model");
    const sessionQuestions =
      await context.questionAnnotationRepository.listBySessionId("session-model");
    const participantBaselines =
      await context.participantBaselineRepository.listByParticipantId(
        "participant-candidate",
      );

    assert.equal(sessionParticipants.length, 2);
    assert.deepEqual(interviewers.map((participant) => participant.id), [
      "participant-interviewer",
    ]);
    assert.equal(sessionPresences[0]?.sourceHint, "late-join");
    assert.deepEqual(sessionQuestions[0]?.topicTags, [
      "ambiguity",
      "ownership",
    ]);
    assert.equal(participantBaselines[0]?.featureSetVersion, "v1");
  } finally {
    await context.cleanup();
  }
});
