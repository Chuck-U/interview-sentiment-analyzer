import { open } from "node:fs/promises";

export type WebmDurationFixResult = {
  readonly patched: boolean;
  readonly reason?: string;
};

const EBML_HEADER_ID = 0x1a45dfa3;
const SEGMENT_ID = 0x18538067;
const INFO_ID = 0x1549a966;
const DURATION_ID = 0x4489;

/**
 * Patches the Duration element inside a WebM file's Segment > Info section.
 * Operates in-place — reads the first portion of the file, locates the
 * Duration float64, and overwrites it with the supplied value.
 */
export async function fixWebmDuration(
  filePath: string,
  durationMs: number,
): Promise<WebmDurationFixResult> {
  const SCAN_BYTES = 256;
  const fh = await open(filePath, "r+");

  try {
    const buf = Buffer.alloc(SCAN_BYTES);
    const { bytesRead } = await fh.read(buf, 0, SCAN_BYTES, 0);
    if (bytesRead < 32) {
      return { patched: false, reason: "file too small" };
    }

    let pos = 0;

    pos = skipElement(buf, pos, bytesRead, EBML_HEADER_ID);
    if (pos < 0) return { patched: false, reason: "EBML header not found" };

    const segPos = expectId(buf, pos, bytesRead, SEGMENT_ID);
    if (segPos < 0) return { patched: false, reason: "Segment not found" };
    pos = segPos;
    pos = skipVint(buf, pos, bytesRead);
    if (pos < 0) return { patched: false, reason: "Segment size unreadable" };

    const infoPos = expectId(buf, pos, bytesRead, INFO_ID);
    if (infoPos < 0) return { patched: false, reason: "Info not found" };
    pos = infoPos;
    pos = skipVint(buf, pos, bytesRead);
    if (pos < 0) return { patched: false, reason: "Info size unreadable" };

    const durResult = findDurationElement(buf, pos, bytesRead);
    if (!durResult) return { patched: false, reason: "Duration element not found" };

    const float64Buf = Buffer.alloc(8);
    float64Buf.writeDoubleBE(durationMs, 0);
    await fh.write(float64Buf, 0, 8, durResult.valueOffset);

    return { patched: true };
  } finally {
    await fh.close();
  }
}

function readVintWidth(byte: number): number {
  for (let i = 0; i < 8; i++) {
    if (byte & (0x80 >> i)) return i + 1;
  }
  return -1;
}

function skipVint(buf: Buffer, pos: number, limit: number): number {
  if (pos >= limit) return -1;
  const width = readVintWidth(buf[pos]);
  if (width < 0 || pos + width > limit) return -1;
  return pos + width;
}

function readElementId(buf: Buffer, pos: number, limit: number): { id: number; next: number } | null {
  if (pos >= limit) return null;
  const width = readVintWidth(buf[pos]);
  if (width < 0 || pos + width > limit) return null;
  let id = 0;
  for (let i = 0; i < width; i++) {
    id = (id << 8) | buf[pos + i];
  }
  return { id, next: pos + width };
}

function readVintValue(buf: Buffer, pos: number, limit: number): { value: number; next: number } | null {
  if (pos >= limit) return null;
  const width = readVintWidth(buf[pos]);
  if (width < 0 || pos + width > limit) return null;
  let value = buf[pos] & (0xff >> width);
  for (let i = 1; i < width; i++) {
    value = (value << 8) | buf[pos + i];
  }
  return { value, next: pos + width };
}

function skipElement(buf: Buffer, pos: number, limit: number, expectedId: number): number {
  const id = readElementId(buf, pos, limit);
  if (!id || id.id !== expectedId) return -1;
  const size = readVintValue(buf, id.next, limit);
  if (!size) return -1;
  return size.next + size.value;
}

function expectId(buf: Buffer, pos: number, limit: number, expectedId: number): number {
  const id = readElementId(buf, pos, limit);
  if (!id || id.id !== expectedId) return -1;
  return id.next;
}

function findDurationElement(
  buf: Buffer,
  start: number,
  limit: number,
): { valueOffset: number } | null {
  let pos = start;
  const searchEnd = Math.min(limit, start + 128);

  while (pos < searchEnd) {
    const id = readElementId(buf, pos, searchEnd);
    if (!id) break;
    const size = readVintValue(buf, id.next, searchEnd);
    if (!size) break;

    if (id.id === DURATION_ID && size.value === 8) {
      return { valueOffset: size.next };
    }

    pos = size.next + size.value;
  }

  return null;
}
