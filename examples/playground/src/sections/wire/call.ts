import type { ArgValues, Grant } from "@command-kernel/core";
import { WireCallError, type WireClient, type WireSpec } from "@command-kernel/wire";
import { type Outcome, traceStore } from "../../trace/trace-store";
import type { Attempt } from "../lab-ui";

export type Via = "auto" | "http";

export type Answer<O> = { ok: true; data: O } | { ok: false; error: WireCallError };

/** The server's refusal codes, as how far the call got through ITS kernel. */
const REACHED: Record<string, Outcome> = {
  unknownCommand: "unresolved",
  invalidArguments: "args",
  forbidden: "blocked",
  confirmRequired: "owed",
};

const asAttempt: Partial<Record<Outcome, Attempt["answer"]>> = {
  ran: "ran",
  owed: "owed",
  blocked: "blocked",
  args: "args",
};

const asError = (e: unknown) =>
  e instanceof WireCallError
    ? e
    : new WireCallError({ code: "serverFail", message: String(e), status: 0 });

/**
 * A failed call as a log line: the gate's refusal reads as blocked or owed, the network
 * or a rate limit as unreached. `grantWhy`: a grant was presented and this is what was
 * done to it, which is why the server owes the approval again (it only says "owed").
 */
export function refusal(e: unknown, grantWhy?: string): Omit<Attempt, "label"> {
  const error = asError(e);
  const outcome = REACHED[error.code] ?? "unreached";
  // the gate's own reason beats a status code
  const failed = error.checks.find((c) => !c.ok);
  return {
    answer: asAttempt[outcome] ?? "unreached",
    detail:
      outcome === "owed" && grantWhy
        ? `${grantWhy}, so the server owes the approval again`
        : failed
          ? `${error.status} ${failed.label}`
          : `${error.status || "no answer"} ${error.code}`,
  };
}

/**
 * One call to the lab through the wire client, recorded twice: in the kernel trace
 * (driver `wire`, so the rail shows the server's verdict next to the page's) and as a
 * line in the section's own log.
 */
export async function labCall<A extends object, O>(
  client: WireClient,
  spec: WireSpec<A, O>,
  args: A,
  opts: {
    via: Via;
    evidence?: Grant;
    label: string;
    log: (a: Attempt) => void;
    /** the log line for a success, from what the server answered */
    done?: (out: O) => string;
    /** a read the page made on its own (on connect): shown on the wire, never in the logs */
    quiet?: boolean;
    /** what this attempt did to the grant it presents ("it was already used") */
    grantWhy?: string;
  },
): Promise<Answer<O>> {
  const { evidence } = opts;
  let answer: Answer<O>;
  try {
    const data = await client.call(spec, args, {
      ...(opts.via === "http" && { via: "http" as const }),
      ...(evidence && { evidence }),
    });
    answer = { ok: true, data };
  } catch (e) {
    answer = { ok: false, error: asError(e) };
  }
  if (opts.quiet) return answer;
  const outcome: Outcome = answer.ok ? "ran" : (REACHED[answer.error.code] ?? "unreached");
  traceStore.record({
    driver: "wire",
    command: spec.node.id,
    title: spec.node.title,
    // the declared arg shape IS an arg bag on the wire
    args: args as ArgValues,
    outcome,
    checks: answer.ok ? [] : answer.error.checks,
    problems: answer.ok ? [] : answer.error.missing,
    grant: evidence ? (answer.ok ? "verified" : "refused") : "none",
    ...(evidence && { sig: `${evidence.sig.slice(0, 10)}…` }),
    ...(!answer.ok && { message: answer.error.message }),
  });
  opts.log(
    answer.ok
      ? { label: opts.label, answer: "ran", detail: opts.done?.(answer.data) ?? "done" }
      : {
          label: opts.label,
          ...refusal(answer.error, evidence && (opts.grantWhy ?? "it did not verify")),
        },
  );
  return answer;
}
