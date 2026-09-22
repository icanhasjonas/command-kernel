import type { Grant } from "@command-kernel/core";

/**
 * Reading what a caller sent, defensively: a body read in chunks that stops at the
 * limit (a chunked upload with no Content-Length cannot make the server buffer it
 * all), and a grant accepted only in its exact shape.
 */

/** The body as text, or null when it is over `maxBytes` or could not be read. Reading stops at the limit. */
export async function readLimited(request: Request, maxBytes: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? Number.NaN);
  if (declared > maxBytes) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    let done: boolean;
    let value: Uint8Array | undefined;
    try {
      ({ done, value } = await reader.read());
    } catch {
      return null; // the caller went away mid-upload, or the stream failed: refuse it
    }
    if (done || !value) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

/** UTF-8 size of a socket message, measured only when it could exceed the limit. */
export function overLimit(message: string, maxBytes: number): boolean {
  return message.length * 3 > maxBytes && new TextEncoder().encode(message).byteLength > maxBytes;
}

/** A grant from a frame field or the `nonce.sig` header; anything else is not a grant. */
export function readGrant(v: unknown): Grant | undefined | "invalid" {
  if (v === undefined || v === null) return undefined;
  if (typeof v === "string") {
    const dot = v.indexOf(".");
    if (dot <= 0 || dot === v.length - 1) return "invalid";
    return { nonce: v.slice(0, dot), sig: v.slice(dot + 1) };
  }
  if (typeof v === "object" && !Array.isArray(v)) {
    const g = v as Record<string, unknown>; // checked field by field
    if (typeof g.nonce === "string" && typeof g.sig === "string")
      return { nonce: g.nonce, sig: g.sig };
  }
  return "invalid";
}
