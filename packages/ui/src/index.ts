/**
 * @command-kernel/ui — driver #1, the human command palette.
 *
 * A React renderer over @command-kernel/core. It owns NO permission logic: every
 * execution flows through the kernel's `command()` + gate, exactly like the
 * agent driver. Swap or restyle this freely — it is just one driver.
 */

// side-effect import: augments React's ButtonHTMLAttributes with the native
// invoker attributes (command / commandfor) for every consumer of this package
import "./dom-command";

export { CommandLauncher } from "./CommandLauncher";
export { CommandPalette } from "./CommandPalette";
export { cn } from "./cn";
export { Icon } from "./icon";
// DRIVER #5 — the native DOM invoker (`<button command>` / `commandfor`)
export {
  type BindInvokersOptions,
  bindInvokers,
  commandAttr,
  INVOKER_PREFIX,
  type InvokerHandlers,
  KERNEL_HOST_ID,
  parseInvoker,
} from "./invokers";
export { Kbd } from "./Kbd";
export { KernelInvoker, type KernelInvokerProps } from "./KernelInvoker";
export type { Mode } from "./usePalette";
export { usePalette } from "./usePalette";
