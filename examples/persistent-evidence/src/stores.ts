/**
 * SEAM #3 (evidence) and SEAM #4 (policy), backed by a plain JSON file on disk
 * via `node:fs` -- headless, no browser, no localStorage. Both implement the
 * exact core interfaces, so `createKernel({ evidence, policy })` wires them in.
 *
 * The honest persistence story (demonstrated in `index.ts`):
 *
 *   - PolicyStore  ("always allow" rules)  persists CLEANLY across restarts.
 *     A standing exception is meant to outlive the session, so a file-backed one
 *     is exactly right.
 *
 *   - EvidenceStore (per-act grants) is SESSION-SALTED BY DESIGN. A grant is a
 *     hash over (command + args + prior-path + nonce + a per-session SALT). The
 *     grant bytes survive on disk fine -- but in a NEW session with a fresh salt
 *     they no longer verify. That is the security property: an approval can't be
 *     replayed past the session it was given in (a browser reload = new salt).
 *     `persistSalt` lets you keep the salt too, which brings grants back across a
 *     restart AT THE COST of that property -- a stolen grant file then replays
 *     forever. Off by default, on purpose.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  type AllowRule,
  type ArgValues,
  bindingKey,
  createMemoryPolicyStore,
  type EvidenceStore,
  type Grant,
  type PolicyStore,
  pathKey,
} from "@command-kernel/core";

function readJson<T>(file: string, fallback: T): T {
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, data: unknown): void {
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

// ---------------------------------------------------------------------------
// SEAM #4 — a file-backed PolicyStore. Rules genuinely persist across sessions.
// ---------------------------------------------------------------------------

/**
 * Wrap the in-memory store (so `match`/dedup semantics stay identical) and
 * mirror the rule list to `file` on every mutation, reloading it on construction.
 */
export function createFilePolicyStore(file: string): PolicyStore {
  const mem = createMemoryPolicyStore();
  for (const rule of readJson<AllowRule[]>(file, [])) mem.allow(rule);

  const persist = () => writeJson(file, mem.list());

  return {
    allow(rule) {
      mem.allow(rule);
      persist();
    },
    revoke(rule) {
      mem.revoke(rule);
      persist();
    },
    clear() {
      mem.clear();
      persist();
    },
    list: () => mem.list(),
    match: (commandId, args) => mem.match(commandId, args),
  };
}

// ---------------------------------------------------------------------------
// SEAM #3 — a file-backed EvidenceStore. Salt-per-session is the whole point.
// ---------------------------------------------------------------------------

/** Stable, order-independent serialization of an arg bag (mirrors core). */
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

function payload(salt: string, commandId: string, args: ArgValues, prior: string, nonce: string) {
  return `${prior}|${commandId}(${argStr(args)})|${nonce}|${salt}`;
}

/** FNV-1a — an honesty tag, not a defense (same shape as the core default). */
function hash(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** A grant persisted alongside its (non-secret) binding, for inspection/replay. */
export interface StoredGrant {
  commandId: string;
  args: ArgValues;
  priorKey: string;
  grant: Grant;
}

interface EvidenceFile {
  /** the per-session salt -- only written when `persistSalt` is on */
  salt: string | null;
  /** an audit log of grants this store has minted */
  grants: StoredGrant[];
}

export interface FileEvidenceOptions {
  /**
   * Keep the session salt on disk so grants verify after a restart. DEFAULT
   * false: a fresh salt each session, so a persisted grant does NOT verify in
   * the next one -- the reload-invalidates-approval property. Set true only if
   * you accept that a saved grant then replays across restarts forever.
   */
  persistSalt?: boolean;
}

/** Read the grants a previous session minted (what a consumer/palette saved). */
export function readStoredGrants(file: string): StoredGrant[] {
  return readJson<EvidenceFile>(file, { salt: null, grants: [] }).grants;
}

export function createFileEvidenceStore(
  file: string,
  opts: FileEvidenceOptions = {},
): EvidenceStore {
  const persistSalt = opts.persistSalt ?? false;
  const disk = readJson<EvidenceFile>(file, { salt: null, grants: [] });

  // reuse a persisted salt ONLY when opted in; otherwise this is a new session.
  let salt = persistSalt && disk.salt ? disk.salt : crypto.randomUUID();
  const log: StoredGrant[] = disk.grants;

  const flush = () => writeJson(file, { salt: persistSalt ? salt : null, grants: log });
  flush();

  const sign: EvidenceStore["sign"] = (commandId, args, priorKey, nonce = crypto.randomUUID()) => {
    const grant: Grant = { nonce, sig: hash(payload(salt, commandId, args, priorKey, nonce)) };
    log.push({ commandId, args, priorKey, grant });
    flush();
    return grant;
  };

  return {
    sign,
    verify(grant, commandId, args, priorKey) {
      if (!grant?.nonce || !grant.sig) return false;
      return hash(payload(salt, commandId, args, priorKey, grant.nonce)) === grant.sig;
    },
    grantForPath(path, principal) {
      const tip = path[path.length - 1];
      if (!tip) throw new Error("grantForPath: empty path");
      return sign(tip.id, tip.args ?? {}, bindingKey(principal, pathKey(path.slice(0, -1))));
    },
    rotate() {
      salt = crypto.randomUUID();
      flush();
    },
  };
}
