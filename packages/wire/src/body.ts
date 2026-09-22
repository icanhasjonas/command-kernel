import type { Grant } from "@command-kernel/core";

/**
 * Reading what a caller sent, defensively: a body read in chunks that stops at the
 * limit (a chunked upload with no Content-Length cannot make the server buffer it
 * all), and a grant accepted only in its exact shape.
 */

/** A body read: its text, or why there is none (over the limit, or the stream failed). */
export type BodyRead = { text: string } | { fail: "tooLarge" | "badRequest" };

/** The body as text, or why it could not be had. Reading stops at the limit. */
export async function readLimited(request: Request, maxBytes: number): Promise<BodyRead> {
  const declared = Number(request.headers.get("content-length") ?? Number.NaN);
  if (declared > maxBytes) return { fail: "tooLarge" };
  if (!request.body) return { text: "" };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    let done: boolean;
    let value: Uint8Array | undefined;
    try {
      ({ done, value } = await reader.read());
    } catch {
      // the caller went away mid-upload, or the stream failed: a bad request, not a big one
      return { fail: "badRequest" };
    }
    if (done || !value) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return { fail: "tooLarge" };
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return { text: new TextDecoder().decode(all) };
}

/** UTF-8 size of a socket message, measured only when it could exceed the limit. */
export function overLimit(message: string, maxBytes: number): boolean {
  return message.length * 3 > maxBytes && new TextEncoder().encode(message).byteLength > maxBytes;
}

const EXPIRY = /^\d{1,16}$/;

/**
 * A grant from a frame field, or from the header: `nonce.expiresAt.sig` (what the
 * built-in stores mint), or `nonce.sig` from a custom store that sets no expiry.
 * Anything else is not a grant.
 */
export function readGrant(v: unknown): Grant | undefined | "invalid" {
  if (v === undefined || v === null) return undefined;
  if (typeof v === "string") {
    const parts = v.split(".");
    const [nonce, mid, last] = parts;
    if (parts.some((p) => !p) || !nonce || !mid) return "invalid";
    if (parts.length === 2) return { nonce, sig: mid };
    if (parts.length !== 3 || !last || !EXPIRY.test(mid)) return "invalid";
    return { nonce, sig: last, expiresAt: Number(mid) };
  }
  if (typeof v === "object" && !Array.isArray(v)) {
    const g = v as Record<string, unknown>; // checked field by field
    const exp = g.expiresAt;
    if (typeof g.nonce !== "string" || typeof g.sig !== "string") return "invalid";
    if (exp === undefined) return { nonce: g.nonce, sig: g.sig };
    if (typeof exp === "number" && Number.isFinite(exp))
      return { nonce: g.nonce, sig: g.sig, expiresAt: exp };
  }
  return "invalid";
}

/** A grant as the evidence header carries it (the inverse of `readGrant`). */
export const grantHeader = (g: Grant) =>
  g.expiresAt === undefined ? `${g.nonce}.${g.sig}` : `${g.nonce}.${g.expiresAt}.${g.sig}`;
