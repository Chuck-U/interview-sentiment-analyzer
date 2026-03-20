import type { SessionSnapshot } from "./session-lifecycle";

/**
 * Decides whether an IPC session update should replace the current store session.
 * Prevents a stale session from overwriting when the id changes and the update is not active.
 */
export function shouldAcceptIncomingSession(
  previousSession: SessionSnapshot | null,
  incoming: SessionSnapshot,
): boolean {
  if (
    previousSession &&
    previousSession.id !== incoming.id &&
    incoming.status !== "active"
  ) {
    return false;
  }

  return true;
}

export function cloneSessionSnapshot(session: SessionSnapshot): SessionSnapshot {
  return {
    ...session,
    captureSources: [...session.captureSources],
    storageLayout: { ...session.storageLayout },
  };
}
