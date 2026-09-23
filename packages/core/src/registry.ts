import type { CommandNode, Ctx } from "./types.js";

/**
 * Provider registry - SEAM #5.
 *
 * The kernel hard-codes no commands. A `Provider` contributes root nodes: either
 * a static array, or a function of the context that contributes LAZILY (so a
 * module can decide what to surface based on where the user is). Register
 * providers up front or incrementally; `roots(ctx)` assembles the live tree.
 *
 *   const registry = createRegistry(usersModule, formsModule)
 *     .register((ctx) => ctx.user.role === "admin" ? [dangerZone] : [])
 *   createKernel({ registry })
 *
 * This is the only assembly point: adding a provider makes its commands appear
 * in EVERY driver (palette, agent, chords, deeplinks) at once.
 */

export type Provider = CommandNode[] | ((ctx: Ctx) => CommandNode[]);

export interface Registry {
  /** Add one or more providers. Chainable. */
  register(...providers: Provider[]): Registry;
  /** Assemble the live root list; function providers run with `ctx` when given. */
  roots(ctx?: Ctx): CommandNode[];
}

export function createRegistry(...providers: Provider[]): Registry {
  const list: Provider[] = [...providers];
  const reg: Registry = {
    register(...more) {
      list.push(...more);
      return reg;
    },
    roots(ctx) {
      const out: CommandNode[] = [];
      for (const p of list) {
        if (typeof p === "function") {
          if (ctx) out.push(...p(ctx));
        } else {
          out.push(...p);
        }
      }
      return out;
    },
  };
  return reg;
}
