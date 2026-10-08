import { registerIcons } from "@command-kernel/ui";
import { DEMO_ICONS } from "./icon-set";

/** Imported once by main.tsx, before the first palette renders. */
registerIcons(DEMO_ICONS);
