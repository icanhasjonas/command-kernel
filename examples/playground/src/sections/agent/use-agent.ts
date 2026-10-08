import { pickTool } from "@command-kernel/agent";
import type { ArgValues, CommandNode, CommandResponse, Grant } from "@command-kernel/core";
import { ruleForNode } from "@command-kernel/core";
import { useRef, useState } from "react";
import { AGENT_TOOLS } from "../../agent-tools";
import { useDemo } from "../../demo/demo-context";
import { drivers } from "../../demo/kernel";
import type { Call, CallStatus } from "./CallCard";

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
  const mark = (id: number, status: CallStatus) =>
    setLines((ls) =>
      ls.map((l) =>
        l.kind === "call" && l.call.id === id ? { ...l, call: { ...l.call, status } } : l,
      ),
    );

  const call = (node: CommandNode, values: ArgValues, evidence?: Grant) =>
    drivers.agent.command(
      { path: [{ id: node.id, args: values, ...(evidence && { evidence }) }], execute: true },
      ctx,
    );

  const settle = (node: CommandNode, res: CommandResponse): boolean => {
    if (res.kind !== "result") return false;
    ran(node.id);
    showResult(res.result);
    say("agent", res.result.message);
    return true;
  };

  async function ask(goal: string) {
    if (!goal.trim()) return;
    say("you", goal);
    const pick = pickTool(goal, AGENT_TOOLS);
    if (!pick) return say("agent", "No tool fits that. Try one of the examples.");
    const res = await call(pick.node, pick.values);
    if (res.kind === "gate") {
      const status = res.verdict.allowed ? "owed" : "blocked";
      return addCall({ node: pick.node, values: pick.values, status, gate: res });
    }
    if (res.kind === "args") {
      const need = [...res.missing, ...res.errors.map((e) => e.message)].join(", ");
      return say("agent", `I still need: ${need}`);
    }
    addCall({ node: pick.node, values: pick.values, status: "done" });
    settle(pick.node, res);
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
    if (settle(c.node, res)) return mark(c.id, "done");
    say(
      "agent",
      how === "forge"
        ? "The forged grant was refused and the gate asked again. An agent cannot approve itself."
        : `That did not take: the kernel answered "${res.kind}".`,
    );
  }

  return {
    lines,
    ask,
    allow: (c: Call) => resolve(c, "once"),
    always: (c: Call) => resolve(c, "always"),
    forge: (c: Call) => resolve(c, "forge"),
    deny: (c: Call) => mark(c.id, "denied"),
  };
}
