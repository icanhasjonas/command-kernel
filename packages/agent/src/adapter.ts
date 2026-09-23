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

export interface ToolPick {
  node: CommandNode;
  values: ArgValues;
}

/**
 * Pick the best-matching tool for a natural-language goal and pre-fill its args
 * from entities found in the goal text. Returns null when nothing matches.
 *
 * This is a deliberately dumb keyword+regex stand-in for an LLM tool-call. Swap
 * it for a real model call that returns `{ node, values }`; everything
 * downstream (the `command()` walk, the gate, the grant) is unchanged.
 */
export function pickTool(goal: string, tools: CommandNode[]): ToolPick | null {
  const g = goal.toLowerCase();
  let best: CommandNode | null = null;
  let bestScore = 0;
  for (const t of tools) {
    const words = [...t.title.toLowerCase().split(/\s+/), ...(t.keywords ?? [])];
    const score = words.reduce((n, w) => (w.length > 2 && g.includes(w) ? n + 1 : n), 0);
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  if (!best || bestScore === 0) return null;

  const email = goal.match(EMAIL)?.[0];
  const sub = goal.match(SUB)?.[0];
  const values: ArgValues = {};
  for (const a of best.args ?? []) {
    if ((a.kind === "email" || a.kind === "entity") && email) values[a.id] = email;
    if (a.id === "user" && email) values[a.id] = email;
    if (a.id === "submissionId" && sub) values[a.id] = sub;
    if (a.id === "subject" && a.enumValues?.[0]) values[a.id] = a.enumValues[0].value;
    if (a.kind === "text") values[a.id] = goal;
  }
  return { node: best, values };
}
