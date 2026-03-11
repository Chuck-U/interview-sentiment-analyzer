import type {
  FinalizeSessionResponse,
  RegisterMediaChunkResponse,
  StartSessionResponse,
} from "../../../shared/session-lifecycle";
import {
  parseFinalizeSessionRequest,
  parseRegisterMediaChunkRequest,
  parseStartSessionRequest,
} from "../../../shared/session-lifecycle";

export type SessionLifecycleController = {
  startSession(input: unknown): Promise<StartSessionResponse>;
  registerMediaChunk(input: unknown): Promise<RegisterMediaChunkResponse>;
  finalizeSession(input: unknown): Promise<FinalizeSessionResponse>;
};

export type SessionLifecycleHandlers = {
  startSession: (
    input: ReturnType<typeof parseStartSessionRequest>,
  ) => Promise<StartSessionResponse>;
  registerMediaChunk: (
    input: ReturnType<typeof parseRegisterMediaChunkRequest>,
  ) => Promise<RegisterMediaChunkResponse>;
  finalizeSession: (
    input: ReturnType<typeof parseFinalizeSessionRequest>,
  ) => Promise<FinalizeSessionResponse>;
};

export function createSessionLifecycleController(
  handlers: SessionLifecycleHandlers,
): SessionLifecycleController {
  return {
    async startSession(input) {
      return handlers.startSession(parseStartSessionRequest(input));
    },
    async registerMediaChunk(input) {
      return handlers.registerMediaChunk(parseRegisterMediaChunkRequest(input));
    },
    async finalizeSession(input) {
      return handlers.finalizeSession(parseFinalizeSessionRequest(input));
    },
  };
}
