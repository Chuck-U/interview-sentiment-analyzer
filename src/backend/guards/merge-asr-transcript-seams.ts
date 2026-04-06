/**
 * Word-level suffix–prefix overlap merge for consecutive streaming ASR strings.
 * Reduces duplicated tails when snippets share boundary text (buffer joins, HF chunk stride).
 */

const DEFAULT_MAX_OVERLAP_WORDS = 32;

function stripWordEdgesForCompare(token: string): string {
  return token
    .replace(/^[^\p{L}\p{N}]+/gu, "")
    .replace(/[^\p{L}\p{N}]+$/gu, "")
    .toLowerCase();
}

function tokenize(text: string): string[] {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

/**
 * Joins `previous` and `next` by dropping the longest matching suffix of `previous`
 * that equals a prefix of `next` (word-aligned, punctuation-tolerant compare).
 */
export function mergeAsrTextSeam(
  previous: string,
  next: string,
  maxOverlapWords: number = DEFAULT_MAX_OVERLAP_WORDS,
): string {
  const a = previous.trim();
  const b = next.trim();
  if (a.length === 0) {
    return b;
  }
  if (b.length === 0) {
    return a;
  }

  const wa = tokenize(a);
  const wb = tokenize(b);
  if (wa.length === 0) {
    return b;
  }
  if (wb.length === 0) {
    return a;
  }

  const maxK = Math.min(wa.length, wb.length, maxOverlapWords);
  let overlap = 0;
  for (let k = maxK; k >= 1; k -= 1) {
    let ok = true;
    for (let i = 0; i < k; i += 1) {
      const left = stripWordEdgesForCompare(wa[wa.length - k + i] ?? "");
      const right = stripWordEdgesForCompare(wb[i] ?? "");
      if (left.length === 0 || right.length === 0 || left !== right) {
        ok = false;
        break;
      }
    }
    if (ok) {
      overlap = k;
      break;
    }
  }

  if (overlap === 0) {
    return `${a} ${b}`.replace(/\s+/g, " ").trim();
  }

  const rest = wb.slice(overlap).join(" ");
  if (rest.length === 0) {
    return a;
  }
  return `${a} ${rest}`.replace(/\s+/g, " ").trim();
}

/** Folds ordered ASR snippets with {@link mergeAsrTextSeam}. */
export function mergeConsecutiveAsrTexts(
  parts: readonly string[],
  maxOverlapWords: number = DEFAULT_MAX_OVERLAP_WORDS,
): string {
  let acc = "";
  for (const p of parts) {
    acc = mergeAsrTextSeam(acc, p, maxOverlapWords);
  }
  return acc.replace(/\s+/g, " ").trim();
}
