import type { ArgValues } from "./args.js";
import { argStr, bindingKey, pathKey } from "./evidence-key.js";
import { hex, hmacSha256, utf8 } from "./sha256.js";
import type { Grant, PathSegment } from "./types.js";

export { bindingKey, pathKey } from "./evidence-key.js";

/**
 * Evidence: SEAM #3, the signature layer of the TRUST CORE.
 *
 * When a human approves an action the gate mints a `Grant`: an HMAC-SHA256
 * signature, under a secret key the caller never sees, over the full binding (who
 * approved and where, the command, its canonical args, and the grant's nonce). A
 * caller, the agent above all, cannot forge `approved: true` or turn one grant into
 * another: without the key no valid signature can be computed for any other
 * command, args, path, principal or nonce.
 *
 * An `EvidenceStore` owns the key and the sign/verify pair. The default
 * `createMemoryEvidenceStore()` draws a random 32-byte key per INSTANCE (no module
 * global: two kernels never share one). `rotate()` draws a new key and so
 * invalidates every outstanding grant; a browser reload does it for free, which is
 * why the session lifetime IS the grant TTL. A host running several isolates (or a
 * Durable Object that hibernates) passes ONE secret to `createHmacEvidenceStore(key)`
 * in each, so a grant minted in one verifies in another. Back it with Redis, or
 * anything else, by implementing this interface and passing `createKernel({ evidence })`.
 */
export interface EvidenceStore {
  /**
   * Mint a grant bound to this exact (command, args, binding context). The kernel's
   * context is `bindingKey(principal, pathKey(prior path))`: WHO approved, and where.
   */
  sign(commandId: string, args: ArgValues, priorKey: string, nonce?: string): Grant;
  /** True only if the grant was minted for THIS command+args+binding context here. */
  verify(grant: Grant | undefined, commandId: string, args: ArgValues, priorKey: string): boolean;
  /**
   * Mint the grant for the TIP of a path, bound to everything before it, using
   * the args AS WRITTEN on the segment.
   *
   * Only correct when the kernel will run those exact args. `prefill` and
   * entity auto-resolution DERIVE different ones, and the grant would then be
   * bound to values that never reach `run()`. Prefer `kernel.grantFor(gateRes)`,
   * which signs the effective args the `gate` response hands back.
   *
   * TEXT ARGS ONLY. A store cannot see arg kinds, so it signs typed values as
   * written while the kernel verifies a declared typed arg in its canonical text
   * form (signing.ts): a grant from here for `{ n: 5 }` on a `number` arg never
   * verifies. Typed args go through `kernel.grantFor`, or sign
   * `signingArgs(node, args)` yourself.
   *
   * `principal` is who the grant is for (`kernel.principalOf(ctx)`); a grant minted
   * without one verifies only under a kernel whose `principalOf` returns undefined.
   */
  grantForPath(path: PathSegment[], principal?: string): Grant;
  /** New key: invalidate every outstanding grant this store minted. */
  rotate(): void;
}

/** The one piece of `crypto` the store needs, read without assuming any lib's types. */
function randomBytes(n: number): Uint8Array {
  type RandomSource = { getRandomValues(array: Uint8Array): Uint8Array };
  const c = (globalThis as unknown as { crypto?: Partial<RandomSource> }).crypto;
  if (typeof c?.getRandomValues !== "function")
    throw new Error("evidence: this runtime has no crypto.getRandomValues");
  return c.getRandomValues(new Uint8Array(n));
}

/**
 * What is signed: one JSON array, so no part can bleed into another (and lone
 * surrogates are escaped before the text becomes bytes).
 */
const payload = (commandId: string, args: ArgValues, priorKey: string, nonce: string) =>
  JSON.stringify(["ck.grant.v1", priorKey, commandId, argStr(args), nonce]);

/** Equal-length strings compared without an early exit on the first difference. */
function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const KEY_BYTES = 32;

/**
 * An evidence store that signs with HMAC-SHA256 under `key` (at least 32 random
 * bytes; the store keeps its own copy). Every store built from the same key accepts
 * the others' grants: that is how a grant minted in one isolate verifies in another.
 * `rotate()` swaps this store to a fresh random key, which detaches it from the
 * shared one; a host that shares a key rotates by building its stores from a new one.
 */
export function createHmacEvidenceStore(key: Uint8Array): EvidenceStore {
  if (!(key instanceof Uint8Array) || key.length < KEY_BYTES)
    throw new Error(`createHmacEvidenceStore: the key must be at least ${KEY_BYTES} random bytes`);
  let secret: Uint8Array = key.slice();
  const mac = (commandId: string, args: ArgValues, priorKey: string, nonce: string) =>
    hex(hmacSha256(secret, utf8(payload(commandId, args, priorKey, nonce))));

  const sign: EvidenceStore["sign"] = (
    commandId,
    args,
    priorKey,
    nonce = hex(randomBytes(16)),
  ) => ({
    nonce,
    sig: mac(commandId, args, priorKey, nonce),
  });

  return {
    sign,
    verify(grant, commandId, args, priorKey) {
      if (typeof grant?.nonce !== "string" || typeof grant.sig !== "string" || !grant.nonce)
        return false;
      return sameText(mac(commandId, args, priorKey, grant.nonce), grant.sig);
    },
    grantForPath(path, principal) {
      const tip = path[path.length - 1];
      if (!tip) throw new Error("grantForPath: empty path");
      return sign(tip.id, tip.args ?? {}, bindingKey(principal, pathKey(path.slice(0, -1))));
    },
    rotate() {
      secret = randomBytes(KEY_BYTES);
    },
  };
}

/**
 * The default evidence store: HMAC-SHA256 under a random key drawn for this store
 * alone. Each call is an independent session; for several isolates that must accept
 * each other's grants, use `createHmacEvidenceStore(sharedKey)`.
 */
export function createMemoryEvidenceStore(): EvidenceStore {
  return createHmacEvidenceStore(randomBytes(KEY_BYTES));
}
