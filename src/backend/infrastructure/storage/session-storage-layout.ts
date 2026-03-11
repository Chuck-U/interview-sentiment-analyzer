import path from "node:path";

import type { SessionStorageLayoutResolver } from "../../application/ports/session-lifecycle";
import type { SessionStorageLayout } from "../../../shared/session-lifecycle";

export function createSessionStorageLayoutResolver(
  appDataRoot: string,
): SessionStorageLayoutResolver {
  return {
    resolveSessionLayout(sessionId: string): SessionStorageLayout {
      const sessionRoot = path.join(appDataRoot, "sessions", sessionId);

      return {
        appDataRoot,
        sessionRoot,
        chunksRoot: path.join(sessionRoot, "chunks"),
        transcriptsRoot: path.join(sessionRoot, "transcripts"),
        summariesRoot: path.join(sessionRoot, "summaries"),
        tempRoot: path.join(sessionRoot, "temp"),
      };
    },
    resolveAbsoluteArtifactPath(sessionId: string, relativePath: string): string {
      const sessionRoot = path.join(appDataRoot, "sessions", sessionId);

      return path.join(sessionRoot, relativePath);
    },
  };
}
