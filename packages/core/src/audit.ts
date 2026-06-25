import type { CommandRequest, CommandResponse } from "./command";
import type { Kernel } from "./create-kernel";
import type { ArgValues, Ctx, PathSegment, Role } from "./types";

/**
 * Audit + replay.
 *
 * A command is already data: an id chain plus args. `CommandRecord` is the
 * serializable, function-free, evidence-free form of one — safe to log, store, or
 * ship over the wire. `createKernel({ onExecute })` fires for every successful
 * run, so audit / telemetry / an undo stack is a one-line opt-in.
 *
 * `replay` re-issues a record through the kernel. Note the trust core still
 * applies: replaying a GATED mutation has no grant, so it correctly comes back as
 * a `gate` for re-approval — you cannot smuggle a past approval into the future.
 * Pure (read-only) commands replay straight through.
 */

export interface CommandRecord {
  path: Array<{ id: string; args?: ArgValues }>;
  role?: Role;
}

/** The serializable record of a command request (drops evidence + functions). */
export function toRecord(req: CommandRequest, ctx: Ctx): CommandRecord {
  return {
    path: (req.path ?? []).map((s) => (s.args ? { id: s.id, args: s.args } : { id: s.id })),
    role: req.role ?? ctx.user.role,
  };
}

/** Re-issue a recorded command through the kernel (gated ones re-prompt). */
export function replay(kernel: Kernel, record: CommandRecord, ctx: Ctx): Promise<CommandResponse> {
  const path: PathSegment[] = record.path.map((s) => ({ id: s.id, args: s.args }));
  return kernel.command({ path, role: record.role, execute: true }, ctx);
}
