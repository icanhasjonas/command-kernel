/**
 * SEAM #3 + #4 demo — what survives a restart, and what deliberately does not.
 *
 *   bun run --filter '@command-kernel/example-persistent-evidence' start
 *   # or: bun examples/persistent-evidence/src/index.ts
 *
 * Each "session" is a fresh `createKernel` pointed at the SAME files on disk --
 * exactly what a second process (or a page reload) sees. We run one gated,
 * confirm-required command three ways and watch the trust core react.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type CommandNode,
  type Ctx,
  createKernel,
  type PathSegment,
  ruleForNode,
} from "@command-kernel/core";
import { createFileEvidenceStore, createFilePolicyStore, readStoredGrants } from "./stores";

const dir = mkdtempSync(join(tmpdir(), "ck-persist-"));
const evidenceFile = join(dir, "evidence.json");
const policyFile = join(dir, "policy.json");
const saltedFile = join(dir, "evidence-salted.json");

// one gated, confirm-required command -- the thing a human must approve.
const RESET: CommandNode = {
  id: "danger.reset",
  title: "Send password reset",
  gate: { roles: ["admin"], confirm: true, reason: "irreversible -- emails a reset link" },
  args: [{ id: "user", label: "user", kind: "email", required: true }],
  run: async ({ user }) => ({ kind: "toast", message: `Reset sent to ${user}` }),
};
const SEG: PathSegment = { id: "danger.reset", args: { user: "jon@wall.north" } };

const ctx: Ctx = {
  location: { module: "home" },
  user: { id: "u1", name: "Jonas", role: "admin", brand: "circle" },
  now: Date.now(),
  frecency: {},
};

const reset = (kernel: ReturnType<typeof createKernel>, seg: PathSegment = SEG) =>
  kernel.command({ path: [seg], execute: true }, ctx).then((r) => r.kind);

function head(n: number, title: string) {
  console.log(`\n${"=".repeat(3)} ${n}. ${title}`);
}

try {
  console.log(`state dir: ${dir}`);

  // -- ACT 1 -------------------------------------------------------------------
  // A per-act grant. It is written to disk, but it is bound to session A's salt.
  head(1, "Per-act GRANT -- survives as bytes, not as approval");
  {
    const A = createKernel({
      evidence: createFileEvidenceStore(evidenceFile),
      policy: createFilePolicyStore(policyFile),
      roots: [RESET],
    });
    console.log(`  session A, no grant     -> ${await reset(A)}   (confirm owed)`);
    const grant = A.evidence.grantForPath([SEG]);
    console.log(
      `  session A, fresh grant  -> ${await reset(A, { ...SEG, evidence: grant })}   (approved)`,
    );
    console.log(`  grant persisted to disk -> ${readStoredGrants(evidenceFile).length} record(s)`);
  }
  {
    // session B: SAME files, but a new EvidenceStore = a new salt.
    const B = createKernel({
      evidence: createFileEvidenceStore(evidenceFile),
      policy: createFilePolicyStore(policyFile),
      roots: [RESET],
    });
    const saved = readStoredGrants(evidenceFile)[0];
    const kind = saved ? await reset(B, { ...SEG, evidence: saved.grant }) : "n/a";
    console.log(`  session B, saved grant  -> ${kind}   (fresh salt -> verify fails)`);
    console.log("  >> the approval did NOT survive the session -- that is the point.");
  }

  // -- ACT 2 -------------------------------------------------------------------
  // A standing "always allow" rule. This is meant to outlive the session, and does.
  head(2, "Standing ALWAYS-ALLOW -- genuinely persists");
  {
    const A = createKernel({
      evidence: createFileEvidenceStore(evidenceFile),
      policy: createFilePolicyStore(policyFile),
      roots: [RESET],
    });
    A.policy.allow(ruleForNode(RESET, SEG.args ?? {}));
    console.log(`  session A, after Always -> ${await reset(A)}   (auto-allowed, no grant)`);
  }
  {
    const B = createKernel({
      evidence: createFileEvidenceStore(evidenceFile),
      policy: createFilePolicyStore(policyFile),
      roots: [RESET],
    });
    console.log(`  session B, rule reloaded -> ${await reset(B)}   (auto-allowed, no grant)`);
    console.log("  >> the standing exception survived the restart -- clean persistence.");
  }

  // -- ACT 3 -------------------------------------------------------------------
  // Opt in to persisting the SALT: grants now replay across restarts -- at a cost.
  head(3, "persistSalt:true -- grants replay, security property traded away");
  {
    const A = createKernel({
      evidence: createFileEvidenceStore(saltedFile, { persistSalt: true }),
      roots: [RESET],
    });
    A.evidence.grantForPath([SEG]);
  }
  {
    const B = createKernel({
      evidence: createFileEvidenceStore(saltedFile, { persistSalt: true }),
      roots: [RESET],
    });
    const saved = readStoredGrants(saltedFile)[0];
    const kind = saved ? await reset(B, { ...SEG, evidence: saved.grant }) : "n/a";
    console.log(`  session B, saved grant  -> ${kind}   (same salt -> verify passes)`);
    console.log("  >> a saved grant now replays forever. Only do this if you accept that.");
  }
  console.log();
} finally {
  rmSync(dir, { recursive: true, force: true });
}
