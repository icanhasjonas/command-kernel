/**
 * The `id` of a frame too big to parse, so an oversized call still settles.
 *
 * Only the `"id"` KEY of the top-level object counts: a scanner walks the first
 * `window` characters tracking strings (and their escapes) and brace/bracket depth,
 * so an `"id"` inside args, or inside a string value, can never be taken for the
 * frame's own id. Anything it cannot be sure of is null.
 */

/** Index of the quote closing the string opened at `open`, or -1 if it does not close. */
function closeQuote(s: string, open: number): number {
  for (let j = open + 1; j < s.length; j++) {
    if (s[j] === "\\") j++;
    else if (s[j] === '"') return j;
  }
  return -1;
}

function decode(raw: string): string | null {
  try {
    const v: unknown = JSON.parse(raw);
    return typeof v === "string" ? v : null;
  } catch {
    return null;
  }
}

const SPACE = /\s/;

export function frameId(message: string, window = 512): string | null {
  const s = message.slice(0, window);
  let depth = 0;
  let expectKey = false; // the next string at depth 1 is a key
  let isId = false; // the last key at depth 1 was "id" and its value has not started
  for (let i = 0; i < s.length; i++) {
    const c = s[i] as string;
    if (c === '"') {
      const end = closeQuote(s, i);
      if (end === -1) return null;
      if (depth === 1) {
        const text = decode(s.slice(i, end + 1));
        if (expectKey) {
          isId = text === "id";
          expectKey = false;
        } else if (isId) {
          return text && text.length <= 64 ? text : null;
        }
      }
      i = end;
    } else if (c === "{" || c === "[") {
      depth++;
      if (depth === 1) expectKey = c === "{";
      else isId = false; // the id's value is a container: not a usable id
    } else if (c === "}" || c === "]") {
      depth--;
      if (depth < 1) return null; // the top-level value ended without an id
    } else if (depth === 1 && c === ",") {
      expectKey = true;
      isId = false;
    } else if (depth === 1 && c !== ":" && !SPACE.test(c)) {
      isId = false; // a number, true, false or null value
    }
  }
  return null;
}
