import type { ArgOption, ArgSpec, ArgValues } from "./args.js";
import type { NodeDescriptor } from "./describe.js";
import type { Entity, EntityRegistry } from "./entity.js";
import type { Confirmation, ExecuteDeps } from "./kernel.js";
import type { Ranker } from "./rank.js";
import type { ArgError } from "./schema.js";
import type { CommandNode, CommandResult, GateVerdict, PathSegment, Role } from "./types.js";

/** What `command()` (command.ts) is asked, what it needs wired in, and what it answers. */

export interface CommandRequest {
  /** addressed chain from the root; empty/omitted = the root menu */
  path?: PathSegment[];
  /** partial text to rank completions at the tip */
  query?: string;
  /** attempt to run the tip instead of browsing into it */
  execute?: boolean;
  /**
   * With `execute`: check args and the gate exactly as a run would, but never run.
   * The answer is `args` / `disambiguate`, or `gate`, whose verdict says whether a
   * confirm is owed (`needsConfirm: false` = this would simply run).
   */
  dryRun?: boolean;
  /** principal override for the whole walk (e.g. an elevated token) */
  role?: Role;
  /** with `execute`: make the tip's grant single-use (see `Confirmation.spend`) */
  spend?: Confirmation["spend"];
}

/** What `command` needs wired in: the ranker, the trust core, and entities. */
export interface CommandDeps extends ExecuteDeps {
  ranker: Ranker;
  /** the entity catalog backing entity-typed args (optional) */
  entities?: EntityRegistry;
}

export type Completion =
  | {
      kind: "command";
      node: CommandNode;
      score: number;
      positions: number[];
      descriptor: NodeDescriptor;
    }
  | { kind: "arg"; arg: ArgSpec; options: ArgOption[]; filled: boolean };

export type CommandResponse =
  | { kind: "completions"; at: CommandNode | null; items: Completion[] }
  | { kind: "args"; node: CommandNode; missing: string[]; errors: ArgError[]; items: Completion[] }
  | { kind: "disambiguate"; node: CommandNode; arg: ArgSpec; query: string; candidates: Entity[] }
  | {
      kind: "gate";
      node: CommandNode;
      verdict: GateVerdict;
      /**
       * The EFFECTIVE args this node will run with: the segment's args after
       * `prefill` merging and entity auto-resolution. A grant must be minted over
       * THESE (with `priorKey`), not over what the caller typed, or verification
       * fails against values the kernel derived. `kernel.grantFor(res)` does it.
       */
      args: ArgValues;
      /** canonical key of the path BEFORE this node: the grant's binding context */
      priorKey: string;
      /** who asked (`principalOf(ctx)`): the grant is bound to them; absent = nobody */
      principal?: string;
      /** `ctx.now` when the gate was asked: a grant minted from this response expires a TTL after it */
      now: number;
    }
  | { kind: "result"; node: CommandNode; result: CommandResult };
