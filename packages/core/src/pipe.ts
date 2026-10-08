import type { ArgKind, ArgSpec, ArgValue, ArgValues, Piped, ValueType } from "./args.js";
import { getOwn, setOwn } from "./own.js";
import { type ArgError, validateArgs } from "./schema.js";
import { canonicalJson } from "./signing.js";
import type { CommandNode, CommandResult } from "./types.js";
import { hasValue } from "./values.js";

/**
 * Pipes - one command's output is the next command's input.
 *
 *   [file] -> Load as text -> Encrypt -> Send email (to: j@duplo.org)
 *
 * A piped value is never a second way in: it lands in ONE arg of the next command
 * and from there it is an ordinary arg - coerced, validated, gated, and signed into
 * the grant exactly like a value typed by hand. So a pipe needs no trust code of
 * its own; it is routing (which arg?) plus a type check (does it fit?).
 */

/** Text kinds a text-ish value may land in. An `email` is text; text is not an email. */
const TEXT_INTO = new Set<ArgKind>(["string", "text"]);
const TEXT_FROM = new Set<ArgKind>(["string", "text", "email"]);

/**
 * Can this arg take a value of this type? An entity needs the same entity type; a
 * closed `enum` never takes a piped value (it would only ever be refused); text
 * flows into text; anything else needs the same kind. A list only fits a list arg.
 */
export function accepts(arg: ArgSpec, type: ValueType): boolean {
  if (type.multiple && !arg.multiple) return false;
  if (type.entity || arg.entity) return arg.entity?.type === type.entity?.type;
  if (arg.kind === "enum" || arg.kind === "entity") return false;
  if (arg.kind === type.kind) return true;
  return TEXT_INTO.has(arg.kind) && TEXT_FROM.has(type.kind);
}

/**
 * The arg a value of this type lands in: the node's declared `input` when it fits;
 * else the one arg that accepts it; else, when several do, the positional one.
 * Null when nothing fits or the choice would be a guess. `input` breaks a tie, it
 * does not close the door: "Send email" names `body` for text, and a file still
 * lands in `attachments`, the only arg that takes one.
 */
export function acceptingArg(node: CommandNode, type: ValueType): ArgSpec | null {
  const fits = (node.args ?? []).filter((a) => accepts(a, type));
  const declared = fits.find((a) => a.id === node.input);
  if (declared) return declared;
  if (fits.length === 1) return fits[0] ?? null;
  return fits.find((a) => a.positional) ?? null;
}

/**
 * A fit that is no stretch: the node named this arg as its input, or the arg is of
 * the value's own kind (text into `text`, not text into a `string` search query).
 * Routing lists these first.
 */
export function fitsExactly(node: CommandNode, arg: ArgSpec, type: ValueType): boolean {
  return node.input === arg.id || arg.kind === type.kind;
}

/** "a person", "text", "a list of file" - for messages. */
export function describeType(type: ValueType): string {
  const name = type.entity ? `a ${type.entity.type}` : type.kind === "json" ? "JSON" : type.kind;
  return type.multiple ? `a list of ${name.replace(/^a /, "")}` : name;
}

export type Bound = { values: ArgValues; arg: ArgSpec } | { error: ArgError };

/**
 * Put a piped value into the args written for a node. A list arg gains it (once);
 * a single arg takes it, unless the caller already wrote a DIFFERENT value there -
 * that is two answers to one question, refused rather than silently picked. Bind
 * into the args the caller wrote, before `prefill`: a piped value outranks a
 * context default, never an explicit one.
 */
export function bindInput(node: CommandNode, written: ArgValues, piped: Piped): Bound {
  const arg = acceptingArg(node, piped.type);
  if (!arg) {
    const message = `${node.title} does not take ${describeType(piped.type)}`;
    return { error: { argId: node.input ?? "", message } };
  }
  const values: ArgValues = {};
  for (const [k, v] of Object.entries(written)) setOwn(values, k, v);
  const prior = getOwn(written, arg.id);
  if (arg.multiple) {
    const list = prior === undefined ? [] : Array.isArray(prior) ? prior : [prior];
    const add = Array.isArray(piped.value) ? piped.value : [piped.value];
    const seen = new Set(list.map((v) => canonicalJson(v)));
    setOwn(values, arg.id, [...list, ...add.filter((v) => !seen.has(canonicalJson(v)))]);
    return { values, arg };
  }
  if (prior !== undefined && hasValue(arg, prior) && !sameValue(prior, piped.value)) {
    return { error: { argId: arg.id, message: `${arg.label} already has a value` } };
  }
  setOwn(values, arg.id, piped.value);
  return { values, arg };
}

function sameValue(a: ArgValue, b: ArgValue): boolean {
  return canonicalJson(a) === canonicalJson(b);
}

/**
 * What a run hands on: its `value` checked against the node's declared `output`,
 * with the same validation an arg of that type gets. A message (string) when the
 * node declares no output, produced none, or produced the wrong thing - a pipe
 * stops there rather than feed the next command something it was never promised.
 */
export function outputOf(node: CommandNode, result: CommandResult): Piped | string {
  const type = node.output;
  if (!type) return `${node.title} produces nothing to pipe on`;
  if (result.value === undefined) return `${node.title} produced no ${describeType(type)}`;
  const spec: ArgSpec = { ...type, id: "value", label: type.label ?? "output", required: true };
  const errors = validateArgs(
    { id: node.id, title: node.title, args: [spec] },
    { value: result.value },
  );
  if (errors.length > 0) return `${node.title}: ${errors.map((e) => e.message).join("; ")}`;
  return { type, value: result.value, ...(type.label !== undefined && { label: type.label }) };
}
