import { describe, expect, it } from "bun:test";
import type { ArgValues } from "./args.js";
import { coerceArgs } from "./coerce.js";
import { createKernel } from "./create-kernel.js";
import { parseDeeplink } from "./deeplink.js";
import type { JsonSchemaNode } from "./schema.js";
import { signingArgs } from "./signing.js";
import { ctx } from "./typed-args.fixtures.test-util.js";
import type { CommandNode } from "./types.js";

/**
 * A caller-supplied "__proto__" key stays an OWN key everywhere the kernel copies an
 * object (review round 5, K1-D1): it is checked, signed and handed to run() exactly
 * as JSON.parse produced it, never turned into the copy's prototype.
 */

const closed = (properties: Record<string, JsonSchemaNode>): JsonSchemaNode => ({
  type: "object",
  properties,
  additionalProperties: false,
});

const nameOnly = closed({ name: { type: "string" } });

function saver(schema: JsonSchemaNode) {
  const seen: ArgValues[] = [];
  const node: CommandNode = {
    id: "cfg.save",
    title: "Save config",
    gate: { confirm: true },
    args: [{ id: "cfg", label: "cfg", kind: "json", schema }],
    run: async (args) => {
      seen.push(args);
      return { kind: "noop", message: "" };
    },
  };
  return { node, seen };
}

/** Approve `approved`, then replay the grant with `replayed`; what came back and what ran. */
async function replay(schema: JsonSchemaNode, approved: ArgValues, replayed: ArgValues) {
  const { node, seen } = saver(schema);
  const k = createKernel({ roots: [node] });
  const first = await k.command({ path: [{ id: node.id, args: approved }], execute: true }, ctx);
  if (first.kind !== "gate") throw new Error(first.kind);
  const evidence = k.grantFor(first);
  const again = await k.command(
    { path: [{ id: node.id, args: replayed, evidence }], execute: true },
    ctx,
  );
  return { again, seen };
}

const attack = (inner: string) => JSON.parse(inner) as ArgValues;

describe("K1-D1: __proto__ is an own key, never a prototype", () => {
  it("a closed schema refuses the extra key instead of running with it", async () => {
    const { again, seen } = await replay(
      nameOnly,
      { cfg: { name: "x" } },
      { cfg: attack('{"name":"x","__proto__":{"admin":true}}') },
    );
    expect(seen).toHaveLength(0);
    expect(again.kind).toBe("args");
    if (again.kind === "args")
      expect(again.errors.map((e) => e.message)).toEqual(["cfg.__proto__ is not allowed"]);
  });

  it("an open schema signs the extra key, so the grant for the smaller object fails", async () => {
    const { again, seen } = await replay(
      { type: "object" },
      { cfg: { name: "x" } },
      { cfg: attack('{"name":"x","__proto__":{"admin":true}}') },
    );
    expect(seen).toHaveLength(0);
    expect(again.kind).toBe("gate");
  });

  it("nested inside properties", async () => {
    const schema = closed({ inner: nameOnly });
    const { again, seen } = await replay(
      schema,
      { cfg: { inner: { name: "x" } } },
      { cfg: attack('{"inner":{"name":"x","__proto__":{"admin":true}}}') },
    );
    expect([again.kind, seen.length]).toEqual(["args", 0]);
  });

  it("inside array items", async () => {
    const schema = closed({ rows: { type: "array", items: nameOnly } });
    const { again, seen } = await replay(
      schema,
      { cfg: { rows: [{ name: "x" }] } },
      { cfg: attack('{"rows":[{"name":"x","__proto__":{"admin":true}}]}') },
    );
    expect([again.kind, seen.length]).toEqual(["args", 0]);
  });

  it("coercion keeps it own and leaves the prototype alone", () => {
    const { node } = saver({ type: "object", properties: { n: { type: "number" } } });
    const out = coerceArgs(node, { cfg: attack('{"n":"1","__proto__":{"admin":true}}') });
    const cfg = out.cfg as Record<string, unknown>;
    expect(Object.hasOwn(cfg, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(cfg)).toBe(Object.prototype);
    expect(cfg.n).toBe(1);
  });

  it("an undeclared __proto__ arg is signed, not dropped", () => {
    const node: CommandNode = { id: "p", title: "p" };
    const signed = signingArgs(node, attack('{"n":"1","__proto__":"x"}'));
    expect(Object.hasOwn(signed, "__proto__")).toBe(true);
  });

  it("a deeplink query keeps __proto__ as an own arg", () => {
    const [seg] = parseDeeplink("cmd/p?__proto__=a&__proto__=b");
    const args = seg?.args ?? {};
    expect(Object.hasOwn(args, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(args)).toBe(Object.prototype);
  });
});
