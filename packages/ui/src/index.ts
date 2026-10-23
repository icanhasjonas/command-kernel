/**
 * @command-kernel/ui - driver #1, the human command palette.
 *
 * A React renderer over @command-kernel/core. It owns NO permission logic: every
 * execution flows through the kernel's `command()` + gate, exactly like the
 * agent driver. Swap or restyle this freely - it is just one driver.
 */

// side-effect import: augments React's ButtonHTMLAttributes with the native
// invoker attributes (command / commandfor) for every consumer of this package
import "./dom-command.js";

export { CommandLauncher } from "./CommandLauncher.js";
export { CommandPalette, type CommandPaletteProps } from "./CommandPalette.js";
export { cn } from "./cn.js";
export { Icon, iconFor, registerIcons } from "./icon.js";
// DRIVER #5 - the native DOM invoker (`<button command>` / `commandfor`)
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
// every word the palette says - override any subset via <CommandPalette labels>
export {
  defaultLabels,
  type PaletteLabelOverrides,
  type PaletteLabels,
  resolveLabels,
} from "./labels.js";
// Arc's motion presets, for a host drawing its own palette over usePalette
export { motionTokens } from "./motion-tokens.js";
export {
  type FrecencyOptions,
  type FrecencyStorage,
  useFrecency,
} from "./useFrecency.js";
export type {
  Mode,
  PaletteArrange,
  PaletteArrangeInput,
  PaletteState,
  PaletteTrigger,
} from "./usePalette.js";
export { usePalette } from "./usePalette.js";
// a host's own search at the root (threads by text): <CommandPalette sources>
export type { PaletteAnswer, PaletteFound, PaletteSource } from "./usePaletteSources.js";
