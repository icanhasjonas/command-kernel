import type { CommandResponse, Grant } from "@command-kernel/core";
import { useEffect, useRef, useState } from "react";
import { useDemo } from "../../demo/demo-context";
import { drivers, kernel } from "../../demo/kernel";
import { useSessionEpoch } from "../../demo/session";
import { needs } from "../../trace/needs";
import { type Attempt, tamper } from "../lab-ui";

export const ASKED = { id: "users.send_reset", args: { user: "jon@wall.north" } };

type Gate = Extract<CommandResponse, { kind: "gate" }>;

/** What the grant in hand is good for now: one run, nothing (used), or nothing (key gone). */
export type GrantLife = "live" | "spent" | "void";

/** Why an unchanged grant is refused, by what has happened to it. */
const WHY_UNUSABLE: Partial<Record<GrantLife, string>> = {
  spent: "it was already used, and a grant runs once",
  void: "the key that signed it was rotated",
};

/**
 * The gate lab: one gated request, one human approval, and the ways an approval
 * must NOT be reusable. Every attempt is a real `command()` call on the shared
 * kernel; the lab only chooses what evidence to present.
 */
export function useGateLab() {
  const { getCtx, ran } = useDemo();
  const [gate, setGate] = useState<Gate | null>(null);
  const [grant, setGrant] = useState<Grant | null>(null);
  const [life, setLife] = useState<GrantLife>("live");
  const [attempts, setAttempts] = useState<Attempt[]>([]);

  // the run step is done only by a run that used the grant, not by any "ran" in the log
  const [ranWithGrant, setRanWithGrant] = useState(false);

  // "New session" up top rotated the key and dropped every rule: a grant in hand is void,
  // the card says so, and the lab starts over from step 1
  const session = useSessionEpoch();
  const seen = useRef(session);
  useEffect(() => {
    if (session === seen.current) return;
    seen.current = session;
    setLife((l) => (l === "live" ? "void" : l));
    setGate(null);
    setRanWithGrant(false);
    setAttempts((xs) =>
      [
        {
          label: "New session",
          answer: "note" as const,
          detail: "a new key and no always-allow rules: any grant from before is void",
        },
        ...xs,
      ].slice(0, 6),
    );
  }, [session]);

  const log = (a: Attempt) => setAttempts((xs) => [a, ...xs].slice(0, 6));

  /**
   * `why`: what this attempt changed about the grant, which is why the kernel will owe
   * the approval again. The kernel only says "owed"; the lab knows what it tampered with.
   */
  async function send(
    label: string,
    args: Record<string, string>,
    evidence?: Grant,
    why = "the grant did not verify",
  ) {
    const res = await drivers.gateLab.command(
      { path: [{ id: ASKED.id, args, ...(evidence && { evidence }) }], execute: true },
      getCtx(),
    );
    if (res.kind === "result") {
      ran(ASKED.id);
      // a grant is good once: the run that used it spent it
      if (evidence) {
        setLife("spent");
        setRanWithGrant(true);
      }
      // no grant and it ran anyway: a standing rule set earlier (the agent's "Always")
      const ruled = !evidence && kernel.policy.match(ASKED.id, args) !== null;
      log({
        label,
        answer: "ran",
        detail: ruled
          ? `${res.result.message}, with no approval: an always-allow rule set earlier covers it (New session, top right, clears it)`
          : res.result.message,
      });
    } else if (res.kind === "gate") {
      const failed = res.verdict.checks.find((c) => !c.ok);
      if (!res.verdict.allowed)
        log({ label, answer: "blocked", detail: failed ? needs(failed.label) : "not permitted" });
      else
        log({
          label,
          answer: "owed",
          // the kernel says only "owed"; what this attempt changed is the lab's to say
          detail: evidence
            ? `the kernel still owes the approval. This attempt: ${why}`
            : "approval owed",
        });
      return res;
    } else log({ label, answer: "args", detail: res.kind });
    return res;
  }

  return {
    gate,
    grant,
    life,
    ranWithGrant,
    attempts,
    async ask() {
      setGrant(null);
      setRanWithGrant(false);
      const res = await send("Ask, no evidence", ASKED.args);
      setGate(res.kind === "gate" && res.verdict.allowed ? res : null);
    },
    approve() {
      if (!gate) return;
      setGrant(drivers.gateLab.grantFor(gate));
      setLife("live");
      log({
        label: "Allow, as you",
        answer: "granted",
        detail: "a grant for this exact call, signed by the kernel, good for one run",
      });
    },
    run: () =>
      grant &&
      send(
        "Run with the grant",
        ASKED.args,
        grant,
        WHY_UNUSABLE[life] ?? "the grant did not verify",
      ),
    otherArgs: () =>
      grant &&
      send(
        "Same grant, another user",
        { user: "ada@analytical.engine" },
        grant,
        "it was signed for jon, not ada",
      ),
    forged: () =>
      grant &&
      send(
        "One hex digit changed",
        ASKED.args,
        { ...grant, sig: tamper(grant.sig) },
        "the signature no longer matches",
      ),
    rotate() {
      kernel.evidence.rotate();
      if (grant) setLife("void");
      log({
        label: "Rotate the key",
        answer: "note",
        detail: "a new signing key: every grant signed with the old one is void",
      });
    },
  };
}
