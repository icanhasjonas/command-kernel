import type { ArgValues, Piped } from "./args.js";
import type { CommandRequest, CommandResponse } from "./command.js";
import type { Kernel } from "./create-kernel.js";
import type { Ctx, PathSegment, Role } from "./types.js";

/**
 * Audit + replay.
 *
 * A command is already data: an id chain plus args. `CommandRecord` is the
 * serializable, function-free, evidence-free form of one - safe to log, store, or
 * ship over the wire. `createKernel({ onExecute })` fires for every successful
 * run, so audit / telemetry / an undo stack is a one-line opt-in.
 *
 * `replay` re-issues a record through the kernel. Note the trust core still
 * applies: replaying a GATED mutation has no grant, so it correctly comes back as
 * a `gate` for re-approval - you cannot smuggle a past approval into the future.
 * Pure (read-only) commands replay straight through.
 */

export interface CommandRecord {
  path: Array<{ id: string; args?: ArgValues }>;
  role?: Role;
  /** the value piped into the tip, when the command ran as a step of a pipe */
  input?: Piped;
}

/** The serializable record of a command request (drops evidence + functions). */
export function toRecord(req: CommandRequest, ctx: Ctx): CommandRecord {
  return {
    path: (req.path ?? []).map((s) => (s.args ? { id: s.id, args: s.args } : { id: s.id })),
    ...(req.role != null ? { role: req.role } : { role: ctx.user.role }),
    ...(req.input !== undefined && { input: req.input }),
  };
}

/** Re-issue a recorded command through the kernel (gated ones re-prompt). */
export function replay(kernel: Kernel, record: CommandRecord, ctx: Ctx): Promise<CommandResponse> {
  const path: PathSegment[] = record.path.map((s) =>
    s.args ? { id: s.id, args: s.args } : { id: s.id },
  );
  return kernel.command(
    {
      path,
      ...(record.role !== undefined && { role: record.role }),
      ...(record.input !== undefined && { input: record.input }),
      execute: true,
    },
    ctx,
  );
}
