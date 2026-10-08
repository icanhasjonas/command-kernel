import { type Ctx, createHmacEvidenceStore, createKernel } from "@command-kernel/core";
import { createWireServer, implement, type WireServer } from "@command-kernel/wire";
import {
  type Flag,
  flipFlag,
  type KeyName,
  LAB_SPECS,
  type LabRole,
  labChanged,
  labStatus,
  rotateKey,
} from "../src/wire/spec";

/**
 * The lab's server half, pure: no Cloudflare types, so `bun test` runs it as is. The
 * Durable Object (lab-do.ts) owns the sockets, the storage and who is calling; this
 * owns the kernel, its gate, its evidence key and the wire server in front of them.
 */

export interface LabState {
  flags: Record<Flag, boolean>;
  keys: Record<KeyName, string>;
  served: number;
}

export interface Visitor {
  id: string;
  role: LabRole;
}

/** What the host gives the lab: its storage, its sockets, and where it runs. */
export interface LabHost {
  /** the grant key, at least 32 random bytes; the same key for the object's whole life */
  key: Uint8Array;
  state: LabState;
  persist(state: LabState): Promise<void>;
  /** a grant's nonce, once: true the first time, false ever after (until it expires) */
  spend(nonce: string, expiresAt: number): Promise<boolean>;
  broadcast(frame: string): void;
  online(): number;
}

export interface Lab {
  wire: WireServer;
  /** `colo` is the Cloudflare data centre the caller came in through */
  ctxFor(visitor: Visitor, now: number, colo: string): Ctx;
}

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

/** A new short key fingerprint, as shown on the page. */
export const fingerprint = () => hex(crypto.getRandomValues(new Uint8Array(4)));

export function freshState(): LabState {
  return {
    flags: { maintenance: false, "beta-banner": true },
    keys: { signing: fingerprint(), public: fingerprint() },
    served: 0,
  };
}

/** The first 6 characters of a visitor id: enough to tell visitors apart, too few to be one. */
export const tagOf = (visitorId: string) => visitorId.slice(0, 6);

/** The demo's commands run with the ctx the host built; the role came from the caller. */
const visitorOf = (ctx: Ctx): Visitor => ({ id: ctx.user.id, role: ctx.user.role as LabRole });

export function createLab(host: LabHost): Lab {
  const { state } = host;

  const changed = (command: string, what: string, ctx: Ctx) => {
    const by = visitorOf(ctx);
    host.broadcast(
      wire.event(labChanged.name, {
        command,
        what,
        by: { role: by.role, tag: tagOf(by.id) },
        flags: state.flags,
        keys: state.keys,
      }),
    );
  };

  const roots = [
    implement(labStatus, async (_args, ctx) => {
      const you = visitorOf(ctx);
      return {
        colo: String(ctx.facts?.colo ?? "unknown"),
        online: host.online(),
        served: state.served,
        flags: state.flags,
        keys: state.keys,
        you: { visitor: tagOf(you.id), role: you.role },
      };
    }),
    implement(
      flipFlag,
      async ({ flag }, ctx) => {
        state.flags[flag] = !state.flags[flag];
        await host.persist(state);
        changed(flipFlag.node.id, `${flag} ${state.flags[flag] ? "on" : "off"}`, ctx);
        return { flag, on: state.flags[flag] };
      },
      (o) => `${o.flag} is ${o.on ? "on" : "off"}`,
    ),
    implement(
      rotateKey,
      async ({ key }, ctx) => {
        state.keys[key] = fingerprint();
        await host.persist(state);
        changed(rotateKey.node.id, key, ctx);
        return { key, fingerprint: state.keys[key] };
      },
      (o) => `${o.key} key is now ${o.fingerprint}`,
    ),
  ];

  const kernel = createKernel({ roots, evidence: createHmacEvidenceStore(host.key) });
  const wire = createWireServer({
    kernel,
    specs: [...LAB_SPECS],
    base: "/api",
    maxBytes: 16 * 1024,
    // The gate has already said the caller MAY do this (admin) and that it wants a
    // confirmation. Here a production host checks a person is present (a passkey tap,
    // a fresh sign-in). The demo's proof is that someone pressed Confirm in the page.
    confirm: ({ ctx }) => ctx.user.role === "admin",
    spend: host.spend,
    onError: (err, name) => console.error(`lab: ${name} threw`, err),
  });

  return {
    wire,
    ctxFor: (visitor, now, colo) => ({
      location: { module: "lab" },
      user: { id: visitor.id, name: tagOf(visitor.id), role: visitor.role, brand: "lab" },
      now,
      frecency: {},
      facts: { colo },
    }),
  };
}
