import type { ArgValues, CommandNode } from "@command-kernel/core";

/**
 * The agent adapter - the headless projection of the kernel as a TOOL SURFACE.
 *
 * It does a toy "which tool, what args" pick over a caller-supplied list of
 * command nodes. A real adapter would hand those same nodes to an LLM as tool
 * schemas (title + summary + arg schema) and let the model choose; the point
 * proven here is that whatever it picks still executes through the IDENTICAL
 * kernel + gate as the human palette - no second code path, no second gate.
 *
 * The tool list is a PARAMETER. This package knows nothing about any specific
 * app's commands; the demo's tool set lives in the example, not here. That is
 * the kernel-as-tool-surface SEAM: bring your own nodes, bring your own picker.
 */

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const SUB = /sub_\d+/i;
/** words that say nothing about which tool is meant */
const FILLER = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "into",
  "this",
  "that",
  "all",
  "some",
]);

export interface ToolPick {
  node: CommandNode;
  values: ArgValues;
}

const wordsOf = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !FILLER.has(w));

/**
 * How well a tool fits: whole words only ("submission" does not match "submissions"),
 * a title word counts twice a keyword, and a tie goes to the tool more of whose title
 * the goal names ("go to submissions" is Go to Submissions, not Re-sync submission).
 */
function fit(goal: Set<string>, t: CommandNode): { points: number; share: number } {
  const title = wordsOf(t.title);
  const keys = (t.keywords ?? []).flatMap(wordsOf);
  const inTitle = title.filter((w) => goal.has(w)).length;
  const inKeys = keys.filter((w) => goal.has(w)).length;
  return { points: inTitle * 2 + inKeys, share: title.length > 0 ? inTitle / title.length : 0 };
}

/**
 * Pick the best-matching tool for a natural-language goal and pre-fill its args
 * from what the goal says. Returns null when nothing matches.
 *
 * This is a deliberately dumb keyword+regex stand-in for an LLM tool-call. Swap
 * it for a real model call that returns `{ node, values }`; everything
 * downstream (the `command()` walk, the gate, the grant) is unchanged.
 */
export function pickTool(goal: string, tools: CommandNode[]): ToolPick | null {
  const words = new Set(wordsOf(goal));
  let best: CommandNode | null = null;
  let top = { points: 0, share: 0 };
  for (const t of tools) {
    const f = fit(words, t);
    if (f.points > top.points || (f.points === top.points && f.share > top.share)) {
      top = f;
      best = t;
    }
  }
  if (!best || top.points === 0) return null;
  return { node: best, values: fill(goal, best) };
}

/**
 * The args a goal states outright. An address fills ONE arg, the first that takes a
 * single person-like value (an email, or one entity), never a list such as attachments.
 */
function fill(goal: string, node: CommandNode): ArgValues {
  const email = goal.match(EMAIL)?.[0];
  const sub = goal.match(SUB)?.[0];
  const values: ArgValues = {};
  let addressed = false;
  for (const a of node.args ?? []) {
    const takesOne = a.kind === "email" || (a.kind === "entity" && !a.multiple);
    if (email && takesOne && !addressed) {
      values[a.id] = email;
      addressed = true;
    }
    if (a.id === "submissionId" && sub) values[a.id] = sub;
    if (a.id === "subject" && a.enumValues?.[0]) values[a.id] = a.enumValues[0].value;
    if (a.kind === "text") {
      const text = textOf(goal, node);
      if (text) values[a.id] = text;
    }
  }
  return values;
}

/** words that only join the request to its target: dropped from the ends of a text arg */
const JOINERS = new Set(["to", "for", "with", "about", "of", "and", "a", "an"]);

/**
 * The part of a goal that is the text itself. The words that picked the tool (its
 * title and keywords), the address, the submission id, and any `also` words (a name
 * the caller resolved to an arg) cut the goal into runs; the longest run, joiners
 * trimmed, is the text. "encrypt the launch date for ada@x.y" seals "the launch date".
 */
export function textOf(goal: string, node: CommandNode, also: readonly string[] = []): string {
  const said = new Set([
    ...wordsOf(node.title),
    ...(node.keywords ?? []).flatMap(wordsOf),
    ...also.map((w) => w.toLowerCase()),
  ]);
  const cut = (w: string) => EMAIL.test(w) || SUB.test(w) || said.has(w.toLowerCase());
  const runs: string[][] = [[]];
  for (const w of goal.split(/\s+/).filter(Boolean)) {
    if (cut(w)) runs.push([]);
    else runs.at(-1)?.push(w);
  }
  const joins = (w: string | undefined) => w !== undefined && JOINERS.has(w.toLowerCase());
  let best = "";
  for (const run of runs) {
    while (joins(run[0])) run.shift();
    while (joins(run.at(-1))) run.pop();
    const text = run.join(" ");
    if (text.length > best.length) best = text;
  }
  return best;
}
