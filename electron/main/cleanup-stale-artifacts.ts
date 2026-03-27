import { readdir, rm, rmdir, stat } from "node:fs/promises";
import path from "node:path";

import { log } from "../../src/lib/logger";

const LEGACY_CHUNK_SUBDIRS = new Set([
  "audio",
  "webcam",
  "desktop-capture",
  "system-audio",
  "screen-video",
  "screenshots",
]);

/**
 * Best-effort startup cleanup that removes stale artifacts from the app data
 * directory. Never throws -- all errors are logged and swallowed so app
 * startup is never blocked.
 */
export async function cleanupStaleArtifacts(appDataRoot: string): Promise<void> {
  try {
    await removeOrphanedTmpFiles(appDataRoot);
    await cleanupSessionArtifacts(appDataRoot);
  } catch (err) {
    log.ger({
      type: "warn",
      message: "[cleanup] top-level cleanup error",
      data: err,
    });
  }
}

async function removeOrphanedTmpFiles(appDataRoot: string): Promise<void> {
  let names: string[];
  try {
    names = await readdir(appDataRoot);
  } catch {
    return;
  }

  for (const name of names) {
    if (/\.tmp-\d+-\d+$/.test(name)) {
      const fullPath = path.join(appDataRoot, name);
      try {
        await rm(fullPath, { force: true });
        log.ger({
          type: "info",
          message: "[cleanup] removed orphaned tmp file",
          data: { path: fullPath },
        });
      } catch {
        // Best-effort.
      }
    }
  }
}

async function cleanupSessionArtifacts(appDataRoot: string): Promise<void> {
  const sessionsDir = path.join(appDataRoot, "sessions");
  let sessionNames: string[];
  try {
    sessionNames = await readdir(sessionsDir);
  } catch {
    return;
  }

  for (const sessionName of sessionNames) {
    const sessionRoot = path.join(sessionsDir, sessionName);
    let sessionStat;
    try {
      sessionStat = await stat(sessionRoot);
    } catch {
      continue;
    }
    if (!sessionStat.isDirectory()) {
      continue;
    }
    await cleanupChunksDir(path.join(sessionRoot, "chunks"));
    await removeEmptyDir(path.join(sessionRoot, "temp"));
  }
}

async function cleanupChunksDir(chunksDir: string): Promise<void> {
  let names: string[];
  try {
    names = await readdir(chunksDir);
  } catch {
    return;
  }

  for (const name of names) {
    const fullPath = path.join(chunksDir, name);

    let entryStat;
    try {
      entryStat = await stat(fullPath);
    } catch {
      continue;
    }

    if (entryStat.isDirectory() && LEGACY_CHUNK_SUBDIRS.has(name)) {
      try {
        await rmdir(fullPath);
        log.ger({
          type: "info",
          message: "[cleanup] removed legacy chunk subdirectory",
          data: { path: fullPath },
        });
      } catch {
        // Not empty or already gone -- skip.
      }
      continue;
    }

    if (entryStat.isFile() && entryStat.size === 0) {
      try {
        await rm(fullPath, { force: true });
        log.ger({
          type: "info",
          message: "[cleanup] removed zero-byte chunk file",
          data: { path: fullPath },
        });
      } catch {
        // Best-effort.
      }
    }
  }
}

async function removeEmptyDir(dirPath: string): Promise<void> {
  try {
    await rmdir(dirPath);
    log.ger({
      type: "info",
      message: "[cleanup] removed empty directory",
      data: { path: dirPath },
    });
  } catch {
    // Not empty or doesn't exist -- expected.
  }
}
