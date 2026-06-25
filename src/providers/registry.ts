import type { CommandNode } from "../kernel/types";
import { formsCategory } from "./forms";
import { connectionsCategory, navCommands, sendEmail, toggleTheme } from "./misc";
import { resendHere, submissionsCategory } from "./submissions";
import { usersCategory } from "./users";

/**
 * The root registry — the only assembly point. Each module contributes its own
 * nodes; the kernel never hard-codes a single command. Adding a feature here is
 * the only step needed for it to appear in EVERY renderer (palette, agent,
 * chords) at once.
 */
export const ROOTS: CommandNode[] = [
  usersCategory,
  formsCategory,
  submissionsCategory,
  connectionsCategory,
  sendEmail,
  resendHere,
  ...navCommands,
  toggleTheme,
];
