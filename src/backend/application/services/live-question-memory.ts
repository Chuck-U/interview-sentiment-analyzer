import type { QuestionDetectionPayload } from "../../../shared/question-detection";

/**
 * Holds the most recent question-detection payload per session for downstream access.
 */
export class LiveQuestionMemory {
  private readonly store = new Map<string, QuestionDetectionPayload>();

  setLatestQuestion(sessionId: string, payload: QuestionDetectionPayload): void {
    this.store.set(sessionId, payload);
  }

  getLatestQuestion(sessionId: string): QuestionDetectionPayload | null {
    return this.store.get(sessionId) ?? null;
  }

  clearSession(sessionId: string): void {
    this.store.delete(sessionId);
  }
}
