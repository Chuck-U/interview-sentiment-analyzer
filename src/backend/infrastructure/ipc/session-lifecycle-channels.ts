export const SESSION_LIFECYCLE_CHANNELS = {
  startSession: "session-lifecycle:start-session",
  registerMediaChunk: "session-lifecycle:register-media-chunk",
  finalizeSession: "session-lifecycle:finalize-session",
} as const;

export const SESSION_LIFECYCLE_EVENT_CHANNELS = {
  sessionChanged: "session-lifecycle:event-session-changed",
  chunkRegistered: "session-lifecycle:event-chunk-registered",
  sessionFinalized: "session-lifecycle:event-session-finalized",
  recoveryIssue: "session-lifecycle:event-recovery-issue",
} as const;
