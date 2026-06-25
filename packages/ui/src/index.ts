/**
 * @command-kernel/ui — driver #1, the human command palette.
 *
 * A React renderer over @command-kernel/core. It owns NO permission logic: every
 * execution flows through the kernel's `command()` + gate, exactly like the
 * agent driver. Swap or restyle this freely — it is just one driver.
 */

export { CommandPalette } from "./CommandPalette";
export { cn } from "./cn";
export { Icon } from "./icon";
export { Kbd } from "./Kbd";
