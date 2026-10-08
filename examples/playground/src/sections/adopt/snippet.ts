/**
 * What an app writes to adopt the kernel: one command, then two drivers on it.
 * Shown on the page as text; snippet.test.ts checks every name it imports is really
 * exported, so the code on the page cannot drift from the packages.
 */
export const ADOPT_SNIPPET = `import { createKernel, type CommandNode } from "@command-kernel/core";
import { CommandPalette, registerIcons } from "@command-kernel/ui";
import { createProjection } from "@command-kernel/agent";
import { KeyRound } from "lucide-react";

// one command: its schema, its gate and its run, in one place
const reset: CommandNode = {
  id: "users.reset",
  title: "Send password reset",
  icon: "KeyRound",
  gate: { roles: ["admin"], confirm: true },
  args: [{ id: "user", label: "user", kind: "email", required: true }],
  run: async ({ user }) => ({ kind: "toast", message: \`Reset sent to \${user}\` }),
};

registerIcons({ KeyRound });
const kernel = createKernel({ roots: [reset] });

// driver 1: the palette, gated by the kernel
<CommandPalette open={open} kernel={kernel} ctx={ctx} roots={kernel.roots(ctx)}
  onClose={close} onResult={(r) => toast(r.message)} onExecuted={() => {}} />

// driver 2: the same command as MCP tools for an agent, same gate
const { tools } = createProjection(kernel);`;
