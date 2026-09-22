import type { ArgValues } from "./args.js";
import { canonicalJson } from "./signing.js";

/**
 * The canonical text a grant is bound to: an arg bag, a walked path, and who
 * approved. Every part is written so two different inputs never produce the same
 * key; the evidence store then signs that key (evidence.ts).
 */

/** Marks a non-text value in a key (ASCII record separator); text starting with it is escaped. */
const TYPED = "\u001e";
/**
 * The characters that separate parts of a key are percent-escaped inside a name or
 * a value, so `{ t: "1&u=2" }` can never key like `{ t: "1", u: "2" }`, `["a,b"]`
 * never like `["a", "b"]`, and the text "[1]a" never like the list `["a"]`. Text
 * without them keys exactly as it always has.
 */
const SEPARATORS = /[%&=,()>|[\]]/g;
export const esc = (s: string) =>
  s.replace(SEPARATORS, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`);
const text = (s: string) => esc(s.startsWith(TYPED) ? TYPED + s : s);

/**
 * A list of text: its length, then its items sorted (a `multiple` arg is a set).
 * The length keeps `[]` apart from `[""]`, and the brackets (escaped inside text)
 * keep `["prod"]` apart from `"prod"`: a key encodes arity, not only the items.
 * Only a `multiple` arg reaches here as a list: a list for a single-value text arg
 * is refused by `validateArgs` before anything is signed.
 */
const textList = (xs: string[]) =>
  `[${xs.length}]${xs
    .map((x) => text(x))
    .sort()
    .join(",")}`;

/**
 * Stable, order-independent serialization of an arg bag. The kernel signs
 * `signingArgs(node, args)` (signing.ts), in which every DECLARED arg is text or a
 * list of text. A non-text value (an undeclared typed arg, or raw typed args a
 * driver signed itself) is written as the TYPED mark plus canonical JSON, so the
 * number 5 and the text "5" never share a key. Only own keys are read.
 */
export function argStr(args: ArgValues): string {
  return Object.keys(args)
    .sort()
    .map((k) => {
      const v = args[k];
      const key = esc(k);
      if (v === undefined || typeof v === "string") return `${key}=${text(v ?? "")}`;
      if (Array.isArray(v) && v.every((x) => typeof x === "string"))
        return `${key}=${textList(v.map(String))}`;
      return `${key}=${TYPED}${esc(canonicalJson(v))}`;
    })
    .join("&");
}

/** Canonical key for a chain of segments: where a grant was approved. */
export function pathKey(segments: Array<{ id: string; args?: ArgValues }>): string {
  return segments.map((s) => `${esc(s.id)}(${argStr(s.args ?? {})})`).join(">");
}

/**
 * The full binding context of a grant: WHO it was minted for, then the prior path.
 * A grant is not a bearer token: another principal replaying it fails to verify.
 * `undefined` (a kernel whose `principalOf` names nobody) keys as the path alone;
 * the principal is escaped, so no principal can forge another's context.
 */
export function bindingKey(principal: string | undefined, priorKey: string): string {
  return principal === undefined ? priorKey : `${esc(principal)}|${priorKey}`;
}
