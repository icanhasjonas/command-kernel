import type { ArgValues, Grant, PathSegment } from "./types.js";

/**
 * Evidence — SEAM #3, the honesty-tag layer of the TRUST CORE.
 *
 * When a human approves an action the gate mints a `Grant`: a cheap hash over
 * (prior path + command + args + nonce + a per-SESSION salt). It is deliberately
 * NOT cryptographically strong. Its single purpose is to stop a caller — the
 * agent above all — from forging `approved: true`: the only way to hold a valid
 * tag is to have gone through the gate, because the salt isn't visible to the
 * caller.
 *
 * An `EvidenceStore` owns the salt and the sign/verify pair. The default
 * `createMemoryEvidenceStore()` keeps the salt in memory on the INSTANCE (no
 * module global — two kernels never share a salt). `rotate()` mints a new salt
 * and so invalidates every outstanding grant; a browser reload does it for free,
 * which is why the session lifetime IS the grant TTL — no expiry clock, no
 * revocation list. Swap the FNV hash for HMAC-SHA, or back it with Redis, by
 * implementing this interface and passing `createKernel({ evidence })`.
 */
export interface EvidenceStore {
  /** Mint a grant bound to this exact (command, args, prior-path). */
  sign(commandId: string, args: ArgValues, priorKey: string, nonce?: string): Grant;
  /** True only if the grant was minted for THIS command+args+prior-path here. */
  verify(grant: Grant | undefined, commandId: string, args: ArgValues, priorKey: string): boolean;
  /**
   * Mint the grant for the TIP of a path, bound to everything before it, using
   * the args AS WRITTEN on the segment.
   *
   * Only correct when the kernel will run those exact args. `prefill` and
   * entity auto-resolution DERIVE different ones, and the grant would then be
   * bound to values that never reach `run()`. Prefer `kernel.grantFor(gateRes)`,
   * which signs the effective args the `gate` response hands back.
   */
  grantForPath(path: PathSegment[]): Grant;
  /** New session salt — invalidate every outstanding grant. */
  rotate(): void;
}

function randomId(seq: { n: number }): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  // fallback for ancient runtimes — entropy quality is irrelevant here
  return `${seq.n++}-${Math.floor(Math.random() * 1e9).toString(16)}`;
}

/** Stable, order-independent serialization of an arg bag (list values are sorted). */
function argStr(args: ArgValues): string {
  return Object.keys(args)
    .sort()
    .map((k) => {
      const v = args[k];
      const s = Array.isArray(v) ? [...v].sort().join(",") : (v ?? "");
      return `${k}=${s}`;
    })
    .join("&");
}

/** Canonical key for a chain of segments — the binding context for a grant. */
export function pathKey(segments: Array<{ id: string; args?: ArgValues }>): string {
  return segments.map((s) => `${s.id}(${argStr(s.args ?? {})})`).join(">");
}

function payload(
  salt: string,
  commandId: string,
  args: ArgValues,
  priorKey: string,
  nonce: string,
): string {
  return `${priorKey}|${commandId}(${argStr(args)})|${nonce}|${salt}`;
}

/** FNV-1a — tiny, synchronous, fast. An honesty tag, not a defense. */
function hash(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * The default evidence store: a per-instance, in-memory, session-salted FNV tag.
 * Each call to this factory is an independent session with its own salt.
 */
export function createMemoryEvidenceStore(): EvidenceStore {
  const seq = { n: 0 };
  let salt = randomId(seq);

  const sign: EvidenceStore["sign"] = (commandId, args, priorKey, nonce = randomId(seq)) => ({
    nonce,
    sig: hash(payload(salt, commandId, args, priorKey, nonce)),
  });

  return {
    sign,
    verify(grant, commandId, args, priorKey) {
      if (!grant?.nonce || !grant.sig) return false;
      return hash(payload(salt, commandId, args, priorKey, grant.nonce)) === grant.sig;
    },
    grantForPath(path) {
      const tip = path[path.length - 1];
      if (!tip) throw new Error("grantForPath: empty path");
      return sign(tip.id, tip.args ?? {}, pathKey(path.slice(0, -1)));
    },
    rotate() {
      salt = randomId(seq);
    },
  };
}
