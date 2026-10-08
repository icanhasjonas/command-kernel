import type { CommandNode } from "@command-kernel/core";
import { resyncSubmission, sendReset } from "./admin";
import { encryptText } from "./crypto";
import { filesCategory, readFile } from "./files";
import { formsCategory } from "./forms";
import { makeThumbnail } from "./media";
import { broadcastEmail, clearTrace, connectionsCategory, navCommands, sendEmail } from "./misc";
import { resendHere, submissionsCategory } from "./submissions";
import { impersonateUser, usersCategory } from "./users";

/**
 * The root registry: the only assembly point. Each module contributes its own
 * nodes; the kernel never hard-codes a single command. Adding a feature here is
 * the only step needed for it to appear in EVERY driver (palette, chords,
 * deeplinks, invokers, the agent) at once.
 */
export const ROOTS: CommandNode[] = [
  usersCategory,
  formsCategory,
  submissionsCategory,
  connectionsCategory,
  filesCategory,
  readFile,
  sendEmail,
  encryptText,
  makeThumbnail,
  broadcastEmail,
  sendReset,
  impersonateUser,
  resyncSubmission,
  resendHere,
  ...navCommands,
  clearTrace,
];
