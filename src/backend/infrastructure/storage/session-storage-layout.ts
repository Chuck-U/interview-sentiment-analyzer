import path from "node:path";

import type { SessionStorageLayoutResolver } from "../../application/ports/session-lifecycle";
import type {
  MediaChunkSource,
  SessionStorageLayout,
} from "../../../shared/session-lifecycle";

const chunkSourceDirectories: Record<MediaChunkSource, string> = {
  microphone: path.join("chunks", "audio"),
  webcam: path.join("chunks", "webcam"),
  "desktop-capture": path.join("chunks", "desktop-capture"),
  "system-audio": path.join("chunks", "system-audio"),
  "screen-video": path.join("chunks", "screen-video"),
  screenshot: path.join("chunks", "screenshots"),
};

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
        recordingsRoot: path.join(sessionRoot, "recordings"),
        transcriptsRoot: path.join(sessionRoot, "transcripts"),
        summariesRoot: path.join(sessionRoot, "summaries"),
        tempRoot: path.join(sessionRoot, "temp"),
      };
    },
    normalizeRelativeArtifactPath(source: MediaChunkSource, relativePath: string) {
      const normalizedRelativePath = path
        .normalize(relativePath)
        .replaceAll("\\", "/")
        .replace(/^\/+/, "");
      const requiredPrefix = `${chunkSourceDirectories[source].replaceAll("\\", "/")}/`;

      if (
        normalizedRelativePath.length === 0 ||
        normalizedRelativePath.startsWith("../") ||
        normalizedRelativePath.includes("/../") ||
        !normalizedRelativePath.startsWith(requiredPrefix)
      ) {
        throw new Error(
          `Artifact path for ${source} must stay within ${requiredPrefix}`,
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
