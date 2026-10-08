import type { Piped, ValueType } from "./args.js";
import type { CommandRequest, CommandResponse } from "./command-types.js";
import { acceptingArg, describeType, type IsA, outputOf } from "./pipe.js";
import type { CommandNode, CommandResult, PathSegment, Role } from "./types.js";

/**
 * Running a pipe: each step is one ordinary `command()` call, its `input` the value
 * the step before produced. Nothing is executed until the whole pipe type-checks,
 * so a write in step 1 never runs when step 3 could not take what step 2 makes.
 */

export interface PipeStep {
  /** addresses the step's command from the root; its tip segment may carry args and a grant */
  path: PathSegment[];
}

export interface PipeRequest {
  steps: PipeStep[];
  /** the value fed to the first step (a subject the user picked); omit to start from nothing */
  input?: Piped;
  /** principal override for every step */
  role?: Role;
}

export type PipeResponse =
  /** every step ran; `output` is what the last one produced, if it declares one */
  | { kind: "done"; results: CommandResult[]; output?: Piped }
  /**
   * Step `step` needs a human: args, a pick between entities, or the gate. Steps
   * before it already ran. Re-issue `resume` (fill args / attach the grant to its
   * first step's tip segment) to carry on from here with the same value.
   */
  | {
      kind: "paused";
      step: number;
      response: CommandResponse;
      results: CommandResult[];
      resume: PipeRequest;
    }
  /** the pipe cannot go on: the reason is for a human */
  | { kind: "broken"; step: number; reason: string; results: CommandResult[] };

type Call = (req: CommandRequest) => Promise<CommandResponse>;

/** The command a step addresses, walked without running anything. */
async function tipOf(call: Call, step: PipeStep, role?: Role): Promise<CommandNode | null> {
  const last = step.path[step.path.length - 1];
  if (!last) return null;
  const res = await call({ path: step.path, ...(role !== undefined && { role }) });
  const at = res.kind === "completions" ? res.at : null;
  return at?.id === last.id ? at : null;
}

/** Check every step takes what the one before makes. A reason when not. */
async function typeCheck(
  call: Call,
  req: PipeRequest,
  isA?: IsA,
): Promise<{ step: number; reason: string } | null> {
  let flowing: ValueType | undefined = req.input?.type;
  for (const [i, step] of req.steps.entries()) {
    const node = await tipOf(call, step, req.role);
    if (!node) return { step: i, reason: `step ${i + 1} addresses no command` };
    if (flowing && !acceptingArg(node, flowing, isA))
      return { step: i, reason: `${node.title} does not take ${describeType(flowing)}` };
    const last = i === req.steps.length - 1;
    if (!last && !node.output)
      return { step: i, reason: `${node.title} produces nothing to pipe on` };
    flowing = node.output;
  }
  return null;
}

/**
 * Run a pipe through `call` (a kernel's bound `command`, so every step goes through
 * the same gate, evidence and audit hook as a single command does). `isA` is the
 * shape rule the type check uses; pass the same one `call` binds with.
 */
export async function runPipe(call: Call, req: PipeRequest, isA?: IsA): Promise<PipeResponse> {
  const results: CommandResult[] = [];
  if (req.steps.length === 0) return { kind: "done", results };
  const wrong = await typeCheck(call, req, isA);
  if (wrong) return { kind: "broken", ...wrong, results };

  let input = req.input;
  for (const [i, step] of req.steps.entries()) {
    const res = await call({
      path: step.path,
      execute: true,
      ...(input !== undefined && { input }),
      ...(req.role !== undefined && { role: req.role }),
    });
    if (res.kind !== "result") {
      const resume: PipeRequest = {
        ...req,
        steps: req.steps.slice(i),
        ...(input !== undefined && { input }),
      };
      return { kind: "paused", step: i, response: res, results, resume };
    }
    results.push(res.result);
    const last = i === req.steps.length - 1;
    if (last && !res.node.output) return { kind: "done", results };
    const out = outputOf(res.node, res.result);
    if (typeof out === "string") return { kind: "broken", step: i, reason: out, results };
    if (last) return { kind: "done", results, output: out };
    input = out;
  }
  return { kind: "done", results };
}
