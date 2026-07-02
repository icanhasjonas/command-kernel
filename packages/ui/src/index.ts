/**
 * @command-kernel/ui — driver #1, the human command palette.
 *
 * A React renderer over @command-kernel/core. It owns NO permission logic: every
 * execution flows through the kernel's `command()` + gate, exactly like the
 * agent driver. Swap or restyle this freely — it is just one driver.
 */

// side-effect import: augments React's ButtonHTMLAttributes with the native
// invoker attributes (command / commandfor) for every consumer of this package
import "./dom-command.js";

export { CommandLauncher } from "./CommandLauncher.js";
export { CommandPalette } from "./CommandPalette.js";
export { cn } from "./cn.js";
export { Icon } from "./icon.js";
// DRIVER #5 — the native DOM invoker (`<button command>` / `commandfor`)
export {
  type BindInvokersOptions,
  bindInvokers,
  commandAttr,
  INVOKER_PREFIX,
  type InvokerHandlers,
  KERNEL_HOST_ID,
  parseInvoker,
} from "./invokers.js";
export { Kbd } from "./Kbd.js";
export { KernelInvoker, type KernelInvokerProps } from "./KernelInvoker.js";
export type { Mode } from "./usePalette.js";
export { usePalette } from "./usePalette.js";
