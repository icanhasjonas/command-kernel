import type { ArgValues } from "./args.js";
import { coerceArgs } from "./coerce.js";
import { setOwn } from "./own.js";
import type { CommandNode } from "./types.js";

/**
 * The one form a grant is signed and verified over.
 *
 * A grant must bind to the value that will RUN, whatever shape a driver holds it
 * in: the palette holds `seen: "yes"`, the wire holds `seen: true`, and both mean
 * the same thing to this node. So sign and verify never see raw args; they see
 * `signingArgs(node, args)`: the args coerced to their declared kinds, then
 * written as text by kind --
 *
 *   text kinds         unchanged (a `multiple` list stays a list: order-free)
 *   number / boolean   their text: 5 -> "5", true -> "true"
 *   json               canonical JSON (sorted keys): one string, so order inside
 *                      a JSON array is kept; a `multiple` json list is ORDERED too,
 *                      its whole list being one canonical string
 *
 * For text-only args this is the identity, so their grants key exactly as before.
 * An arg the node does not declare has no kind to coerce to, so it keeps its own
 * type, and the evidence key keeps a number apart from the same-looking text.
 */

export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v !== null && typeof v === "object") {
    const obj = v as Record<string, unknown>; // a non-array object: walk its own keys
    return `{${Object.keys(obj)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}

const isText = (v: unknown) =>
  typeof v === "string" || (Array.isArray(v) && v.every((x) => typeof x === "string"));

export function signingArgs(node: CommandNode, values: ArgValues): ArgValues {
  const typed = coerceArgs(node, values);
  const kinds = new Map((node.args ?? []).map((a) => [a.id, a.kind]));
  const out: ArgValues = {};
  for (const [id, v] of Object.entries(typed)) {
    const kind = kinds.get(id);
    // a caller-supplied id may be "__proto__": it must stay a signed key (own.ts)
    // a json value, `multiple` or not, is one canonical string: order inside it counts
    if (kind === "json") setOwn(out, id, canonicalJson(v));
    else if (isText(v)) setOwn(out, id, v);
    else if (kind === "number" || kind === "boolean")
      setOwn(out, id, Array.isArray(v) ? v.map((x) => String(x)) : String(v));
    else setOwn(out, id, v); // undeclared: bound as-is, type included (see evidence argStr)
  }
  return out;
}
