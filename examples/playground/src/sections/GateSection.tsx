import { cn } from "@command-kernel/ui";
import { useDemo } from "../demo/demo-context";
import { GrantCard } from "./gate/GrantCard";
import { ASKED, type Attempt, useGateLab } from "./gate/use-gate-lab";
import { Code, Panel, Section } from "./Section";

const TONE: Record<Attempt["answer"], string> = {
  ran: "text-teal-soft",
  owed: "text-amber-soft",
  blocked: "text-red-300",
  args: "text-amber-soft",
  note: "text-white/55",
};

function Step({
  n,
  label,
  done,
  children,
}: {
  n: number;
  label: string;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-3">
      <span
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-[11px]",
          done ? "border-teal-soft/50 bg-teal/25 text-teal-soft" : "border-white/15 text-white/50",
        )}
      >
        {n}
      </span>
      <span className="w-20 shrink-0 text-[13px] text-white/70">{label}</span>
      {children}
    </li>
  );
}

const btn =
  "rounded-lg border border-white/12 px-3 py-1.5 text-[13px] text-white/85 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-35";

/** Chapter 3: the trust core. One approval, bound to who, what, and where, and nothing else. */
export function GateSection() {
  const lab = useGateLab();
  const { ctx } = useDemo();
  return (
    <Section
      id="gate"
      title="The gate lives in the kernel"
      lede={
        <>
          Permissions are declared once on the command and enforced by the kernel, so no driver can
          skip them. An approval becomes a <em>grant</em>: an HMAC signature over who approved, the
          exact args, and the path, under a key that never leaves the kernel. Approve one reset,
          then try to stretch the grant to cover something else.
        </>
      }
    >
      <Panel className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="border-white/8 p-5 lg:border-r">
          <div className="font-mono text-[12px] text-white/60">
            {ASKED.id}(user: "{ASKED.args.user}")
          </div>
          <div className="mt-1 text-[12px] text-white/45">
            gate: admin only, confirm every run · you are <Code>{ctx.user.role}</Code>
          </div>
          <ol className="mt-5 space-y-3">
            <Step n={1} label="Ask" done={lab.gate !== null}>
              <button type="button" className={btn} onClick={() => void lab.ask()}>
                Send the request
              </button>
            </Step>
            <Step n={2} label="Approve" done={lab.grant !== null}>
              <button type="button" className={btn} disabled={!lab.gate} onClick={lab.approve}>
                Allow, as you
              </button>
            </Step>
            <Step n={3} label="Run" done={lab.attempts.some((a) => a.answer === "ran")}>
              <button
                type="button"
                className={btn}
                disabled={!lab.grant}
                onClick={() => void lab.run()}
              >
                Run with the grant
              </button>
            </Step>
          </ol>
          <div className="mt-6 border-white/8 border-t pt-4">
            <div className="text-[13px] text-white/70">Try to break it</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className={btn}
                disabled={!lab.grant}
                onClick={() => void lab.otherArgs()}
              >
                Reuse it for another user
              </button>
              <button
                type="button"
                className={btn}
                disabled={!lab.grant}
                onClick={() => void lab.forged()}
              >
                Change one hex digit
              </button>
              <button type="button" className={btn} onClick={lab.rotate}>
                Rotate the key
              </button>
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-white/45">
              Or switch your role to viewer up top and send it again: the gate refuses before any
              evidence is even looked at.
            </p>
          </div>
        </div>
        <div className="p-5">
          <GrantCard grant={lab.grant} principal={ctx.user.id} />
          <ul className="mt-5 space-y-2" aria-live="polite">
            {lab.attempts.map((a, i) => (
              // attempts are a short, newest-first log with no stable id of their own
              // biome-ignore lint/suspicious/noArrayIndexKey: positional log
              <li key={i} className="text-[13px]">
                <span className="text-white/80">{a.label}</span>{" "}
                <span className={TONE[a.answer]}>→ {a.answer}</span>
                {a.detail && <span className="text-white/45"> · {a.detail}</span>}
              </li>
            ))}
          </ul>
        </div>
      </Panel>
    </Section>
  );
}
