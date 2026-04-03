import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

import type { SessionStorageLayoutResolver } from "../../application/ports/session-lifecycle";
import type { AudioMediaSource } from "../../../shared/session-lifecycle";

export const SESSION_TRANSCRIPT_LOG_FILE_NAME = "transcrpt.log";

export type AppendSessionTranscriptLogInput = {
  readonly storageLayoutResolver: SessionStorageLayoutResolver;
  readonly sessionId: string;
  readonly source: AudioMediaSource;
  readonly text: string;
  readonly timestamp?: string;
};

function mapTranscriptLogSpeaker(source: AudioMediaSource): string {
  switch (source) {
    case "desktop-capture":
      return "interviewer";
    case "microphone":
      return "you";
    case "system-audio":
      return "system-audio";
  }
}

function normalizeTranscriptLogText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export async function appendSessionTranscriptLog(
  input: AppendSessionTranscriptLogInput,
): Promise<string> {
  const sessionRoot =
    input.storageLayoutResolver.resolveSessionLayout(input.sessionId).sessionRoot;
  const logPath = path.join(sessionRoot, SESSION_TRANSCRIPT_LOG_FILE_NAME);
  const timestamp = input.timestamp ?? new Date().toISOString();
  const speaker = mapTranscriptLogSpeaker(input.source);
  const text = normalizeTranscriptLogText(input.text);
  const line = `${timestamp}\t${speaker}\t${text}\n`;

  await mkdir(sessionRoot, { recursive: true });
  await appendFile(logPath, line, "utf8");

  return logPath;
}
