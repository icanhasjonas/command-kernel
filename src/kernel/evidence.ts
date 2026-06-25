import type { ArgValues, Grant, PathSegment } from "./types";

/**
 * Evidence — the honesty-tag layer.
 *
 * A gate, when a human approves an action, mints a `Grant`: a cheap hash over
 * (prior path + command + args + nonce + a per-SESSION salt). It is deliberately
 * NOT cryptographically strong. Its single purpose is to stop a caller — the
 * agent above all — from forging `approved: true`: the only way to hold a valid
 * tag is to have gone through the gate, because the salt isn't visible to the
 * caller. Swap the hash for SHA later if you ever care; the shape won't change.
 *
 * The salt is get-or-create per session and lives only in memory. Reload the
 * tab → fresh module → fresh salt → every previously minted grant stops
 * verifying. The session lifetime IS the grant TTL. No expiry clock, no
 * revocation list.
 */

let salt: string | null = null;

/** Get-or-create the per-session salt. */
export function sessionSalt(): string {
  if (salt === null) salt = randomId();
  return salt;
}

/**
 * Force a new session salt (and thus invalidate every outstanding grant).
 * The browser does this for free on reload; this is the explicit "new session"
 * button + the test hook.
 */
export function rotateSessionSalt(): void {
  salt = randomId();
}

function randomId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  // fallback for ancient runtimes — entropy quality is irrelevant here
  return `${seq++}-${Math.floor(Math.random() * 1e9).toString(16)}`;
}
let seq = 0;

/** Stable, order-independent serialization of an arg bag. */
function argStr(args: ArgValues): string {
  return Object.keys(args)
    .sort()
    .map((k) => `${k}=${args[k]}`)
    .join("&");
}

/** Canonical key for a chain of segments — the binding context for a grant. */
export function pathKey(segments: Array<{ id: string; args?: ArgValues }>): string {
  return segments.map((s) => `${s.id}(${argStr(s.args ?? {})})`).join(">");
}

function payload(commandId: string, args: ArgValues, priorKey: string, nonce: string): string {
  return `${priorKey}|${commandId}(${argStr(args)})|${nonce}|${sessionSalt()}`;
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

/** Mint a grant bound to this exact (command, args, prior-path) under the session salt. */
export function signGrant(
  commandId: string,
  args: ArgValues,
  priorKey: string,
  nonce: string = randomId(),
): Grant {
  return { nonce, sig: hash(payload(commandId, args, priorKey, nonce)) };
}

/** True only if the grant was minted for THIS command+args+prior-path in THIS session. */
export function verifyGrant(
  grant: Grant | undefined,
  commandId: string,
  args: ArgValues,
  priorKey: string,
): boolean {
  if (!grant?.nonce || !grant.sig) return false;
  return hash(payload(commandId, args, priorKey, grant.nonce)) === grant.sig;
}

/**
 * Convenience for a driver: mint the grant for the TIP of a path, bound to
 * everything before it. The driver calls this only after a human clicks Allow,
 * then sets it as `evidence` on the tip segment and re-issues the command.
 */
export function grantForPath(path: PathSegment[]): Grant {
  const tip = path[path.length - 1];
  if (!tip) throw new Error("grantForPath: empty path");
  return signGrant(tip.id, tip.args ?? {}, pathKey(path.slice(0, -1)));
}
