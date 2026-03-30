import path from "node:path";

import type { SessionStorageLayoutResolver } from "../../application/ports/session-lifecycle";
import type {
  MediaChunkSource,
  SessionStorageLayout,
} from "../../../shared/session-lifecycle";

const CHUNKS_PREFIX = "chunks/";

export function createSessionStorageLayoutResolver(
  appDataRoot: string,
): SessionStorageLayoutResolver {
  return {
    resolveSessionLayout(sessionId?: string): SessionStorageLayout {
      const sessionRoot = [appDataRoot, "sessions", sessionId ?? ""].filter(Boolean).join(path.sep);

      return {
        appDataRoot,
        sessionRoot,
        chunksRoot: path.join(sessionRoot, "chunks"),
        recordingsRoot: path.join(sessionRoot, "recordings"),
        transcriptsRoot: path.join(sessionRoot, "transcripts"),
        summariesRoot: path.join(sessionRoot, "summaries"),
        tempRoot: path.join(sessionRoot, "temp"),
      };
    },
    normalizeRelativeArtifactPath(_source: MediaChunkSource, relativePath: string) {
      const normalizedRelativePath = path
        .normalize(relativePath)
        .replaceAll("\\", "/")
        .replace(/^\/+/, "");

      if (
        normalizedRelativePath.length === 0 ||
        normalizedRelativePath.startsWith("../") ||
        normalizedRelativePath.includes("/../") ||
        !normalizedRelativePath.startsWith(CHUNKS_PREFIX)
      ) {
        throw new Error(
          `Artifact path must stay within ${CHUNKS_PREFIX}`,
        );
      }

      return normalizedRelativePath;
    },
    resolveAbsoluteArtifactPath(sessionId: string, relativePath: string): string {
      const sessionRoot = path.join(appDataRoot, "sessions", sessionId);

      return path.join(sessionRoot, relativePath);
    },
  };
}
