import { pickTool } from "@command-kernel/agent";
import type { ArgValues, CommandNode, CommandResponse, Grant } from "@command-kernel/core";
import { ruleForNode } from "@command-kernel/core";
import { useRef, useState } from "react";
import { AGENT_TOOLS } from "../../agent-tools";
import { useDemo } from "../../demo/demo-context";
import { drivers, viaAgent } from "../../demo/kernel";
import { traceStore } from "../../trace/trace-store";
import type { Call, CallStatus } from "./CallCard";
import { fillFromNames, verbItCannotDo } from "./understand";

/**
 * What the agent says when the kernel sent its call back for args: what it got wrong,
 * then what it still needs, by the args' names and in words a person would use.
 */
function askFor(
  node: CommandNode,
  missing: string[],
  errors: { argId: string; message: string }[],
): string {
  const label = (id: string) => node.args?.find((a) => a.id === id)?.label ?? id;
  const wrong = errors.map((e) => `${label(e.argId)}: ${e.message}.`).join(" ");
  const need = missing.map(label);
  const ask =
    need.length > 0
      ? ` To ${node.title.toLowerCase()} I still need the ${need.join(" and the ")}. Say it again with ${need.length > 1 ? "them" : "it"}.`
      : " Say it again with a value that exists.";
  return `${wrong ? `That did not check out. ${wrong}` : "Not enough to go on."}${ask}`;
}

export type Line =
  | { id: number; kind: "you" | "agent"; text: string }
  | { id: number; kind: "call"; call: Call };

/**
 * The agent driver. A (toy) model picks a tool and fills its args; the call goes to
 * the SAME `command()` as every other driver, with no grant. A gated tool comes back
 * as a gate, and only the operator's click turns it into evidence: the model has no
 * way to mint one, and a grant it makes up is refused by the evidence store.
 */
export function useAgent() {
  const { ctx, showResult, ran } = useDemo();
  const [lines, setLines] = useState<Line[]>([]);
  const seq = useRef(0);

  const say = (kind: "you" | "agent", text: string) =>
    setLines((ls) => [...ls, { id: ++seq.current, kind, text }]);
  const addCall = (c: Omit<Call, "id">) => {
    const id = ++seq.current;
    setLines((ls) => [...ls, { id, kind: "call", call: { ...c, id } }]);
  };
  const mark = (id: number, status: CallStatus, more: Partial<Call> = {}) =>
    setLines((ls) =>
      ls.map((l) =>
        l.kind === "call" && l.call.id === id ? { ...l, call: { ...l.call, status, ...more } } : l,
      ),
    );

  const call = (node: CommandNode, values: ArgValues, evidence?: Grant) =>
    drivers.agent.command(
      { path: [{ id: node.id, args: values, ...(evidence && { evidence }) }], execute: true },
      // the gate knows the agent chose this: a write waits for your Allow
      viaAgent(ctx),
    );

  /** A run's answer, or null: it is shown on the call's own card, never as a loose line. */
  const settle = (node: CommandNode, res: CommandResponse): string | null => {
    if (res.kind !== "result") return null;
    ran(node.id);
    showResult(res.result);
    return res.result.message;
  };

  async function ask(goal: string) {
    if (!goal.trim()) return;
    say("you", goal);
    const found = pickTool(goal, AGENT_TOOLS);
    if (!found)
      return say(
        "agent",
        "No tool fits that. This agent only matches keywords to tool names; try a goal below.",
      );
    const verb = verbItCannotDo(goal, found.node);
    if (verb)
      return say(
        "agent",
        `None of my tools can ${verb} anything, so I am not running one. Ask an admin to do it by hand.`,
      );
    const pick = {
      node: found.node,
      values: await fillFromNames(goal, found.node, found.values, drivers.agent.entities, ctx),
    };
    const res = await call(pick.node, pick.values);
    if (res.kind === "gate") {
      const status = res.verdict.allowed ? "owed" : "blocked";
      return addCall({ node: pick.node, values: pick.values, status, gate: res });
    }
    if (res.kind === "args") return say("agent", askFor(pick.node, res.missing, res.errors));
    const result = settle(pick.node, res);
    addCall({
      node: pick.node,
      values: pick.values,
      status: "done",
      ...(result !== null && { result }),
    });
  }

  async function resolve(c: Call, how: "once" | "always" | "forge") {
    // always: a standing policy rule, so the re-issued call needs no grant at all
    if (how === "always") drivers.agent.policy.allow(ruleForNode(c.node, c.values));
    const evidence =
      how === "once" && c.gate
        ? drivers.agent.grantFor(c.gate)
        : how === "forge"
          ? { nonce: "made-up", sig: "deadbeefdeadbeef" }
          : undefined;
    const res = await call(c.node, c.values, evidence);
    const result = settle(c.node, res);
    if (result !== null) return mark(c.id, "done", { result });
    // a refused forgery is told on the call's card, which then moves on with the call
    if (how === "forge") return mark(c.id, "owed", { forged: true });
    say("agent", `That did not take: the kernel answered "${res.kind}".`);
  }

  return {
    lines,
    ask,
    allow: (c: Call) => resolve(c, "once"),
    always: (c: Call) => resolve(c, "always"),
    forge: (c: Call) => resolve(c, "forge"),
    deny: (c: Call) => {
      mark(c.id, "denied");
      // the trace still shows this call owed: say how it ended, so it does not hang there
      traceStore.record({
        driver: "agent",
        command: c.node.id,
        title: c.node.title,
        args: c.values,
        outcome: "denied",
        checks: [],
        problems: [],
        grant: "none",
      });
    },
  };
}
