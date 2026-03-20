import type { QuestionAnnotationEntity } from "../../domain/question/question-annotation";

export type QuestionAnnotationRepository = {
  listByChunkId(chunkId: string): Promise<readonly QuestionAnnotationEntity[]>;
  listBySessionId(sessionId: string): Promise<readonly QuestionAnnotationEntity[]>;
  save(annotation: QuestionAnnotationEntity): Promise<void>;
};
