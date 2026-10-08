import type { Driver } from "./trace-store";

/** How each driver is named and drawn in the rail and on the page. One table, both places. */
export const DRIVER_META: Record<Driver, { label: string; icon: string; tone: string }> = {
  palette: { label: "Palette", icon: "Command", tone: "text-pink-soft" },
  chord: { label: "Chord", icon: "Keyboard", tone: "text-pink-soft" },
  deeplink: { label: "Deeplink", icon: "Link", tone: "text-sky-300" },
  invoker: { label: "<button command>", icon: "MousePointerClick", tone: "text-sky-300" },
  agent: { label: "Agent", icon: "Bot", tone: "text-violet-300" },
  pipe: { label: "Pipe", icon: "Workflow", tone: "text-teal-soft" },
  "gate-lab": { label: "Gate lab", icon: "ShieldCheck", tone: "text-amber-soft" },
  wire: { label: "Wire · server kernel", icon: "Cable", tone: "text-sky-300" },
};
