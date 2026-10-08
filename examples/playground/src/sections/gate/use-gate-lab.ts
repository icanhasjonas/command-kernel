import type { CommandResponse, Grant } from "@command-kernel/core";
import { useState } from "react";
import { useDemo } from "../../demo/demo-context";
import { drivers, kernel } from "../../demo/kernel";
import { type Attempt, tamper } from "../lab-ui";

export const ASKED = { id: "users.send_reset", args: { user: "jon@wall.north" } };

type Gate = Extract<CommandResponse, { kind: "gate" }>;

/**
 * The gate lab: one gated request, one human approval, and the ways an approval
 * must NOT be reusable. Every attempt is a real `command()` call on the shared
 * kernel; the lab only chooses what evidence to present.
 */
export function useGateLab() {
  const { getCtx, ran } = useDemo();
  const [gate, setGate] = useState<Gate | null>(null);
  const [grant, setGrant] = useState<Grant | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);

  const log = (a: Attempt) => setAttempts((xs) => [a, ...xs].slice(0, 6));

  async function send(label: string, args: Record<string, string>, evidence?: Grant) {
    const res = await drivers.gateLab.command(
      { path: [{ id: ASKED.id, args, ...(evidence && { evidence }) }], execute: true },
      getCtx(),
    );
    if (res.kind === "result") {
      ran(ASKED.id);
      log({ label, answer: "ran", detail: res.result.message });
    } else if (res.kind === "gate") {
      const failed = res.verdict.checks.find((c) => !c.ok);
      if (!res.verdict.allowed)
        log({ label, answer: "blocked", detail: failed?.label ?? "not permitted" });
      else
        log({
          label,
          answer: "owed",
          detail: evidence
            ? "the grant did not verify, so the approval is still owed"
            : "approval owed",
        });
      return res;
    } else log({ label, answer: "args", detail: res.kind });
    return res;
  }

  return {
    gate,
    grant,
    attempts,
    async ask() {
      setGrant(null);
      const res = await send("Ask, no evidence", ASKED.args);
      setGate(res.kind === "gate" && res.verdict.allowed ? res : null);
    },
    approve() {
      if (gate) setGrant(drivers.gateLab.grantFor(gate));
    },
    run: () => grant && send("Run with the grant", ASKED.args, grant),
    otherArgs: () =>
      grant && send("Same grant, another user", { user: "ada@analytical.engine" }, grant),
    forged: () =>
      grant && send("One hex digit changed", ASKED.args, { ...grant, sig: tamper(grant.sig) }),
    rotate() {
      kernel.evidence.rotate();
      log({
        label: "New session",
        answer: "note",
        detail: "signing key rotated; old grants are dead",
      });
    },
  };
}
