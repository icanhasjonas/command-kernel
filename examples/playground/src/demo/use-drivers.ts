import { createKeyboard, parseDeeplink } from "@command-kernel/core";
import { useEffect } from "react";
import { useDemo } from "./demo-context";
import { drivers, kernel } from "./kernel";

/**
 * The page-level drivers: the keyboard (⌘K, and ⌘+letter chords straight into a
 * command) and the URL hash (`#/cmd/<path>` runs that command). Neither decides
 * anything: the keyboard opens the palette on a node, the hash calls `command()`,
 * and a gated command answers with a gate whatever asked.
 */
export function usePageDrivers() {
  const { getCtx, openPalette, showResult, say, ran } = useDemo();

  useEffect(() => {
    const kb = createKeyboard();
    kb.pushLayer({ "mod+k": () => openPalette() }, { base: true, id: "palette-launcher" });
    kb.registerShortcuts(
      new Map([...kernel.chords(getCtx())].map(([c, n]) => [`mod+${c}`, n] as const)),
      { onActivate: (n) => openPalette(n.id, "chord") },
    );
    const onKey = (e: KeyboardEvent) => kb.handleKeydown(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [getCtx, openPalette]);

  useEffect(() => {
    const run = async () => {
      const h = window.location.hash.replace(/^#\/?/, "");
      if (!h.startsWith("cmd/")) return;
      const path = parseDeeplink(h);
      const res = await drivers.deeplink.command({ path, execute: true }, getCtx());
      if (res.kind === "result") {
        ran(res.node.id);
        showResult(res.result);
        return;
      }
      if (res.kind === "completions") return say("That link names no command", "warn");
      // the link got as far as it could: the palette takes over on that command, with
      // the args the link carried, asking for the rest or for a person's approval
      if (res.kind === "gate" && !res.verdict.allowed)
        return say(`"${res.node.title}" is not allowed for your role`, "warn");
      openPalette(res.node.id, "deeplink", path[path.length - 1]?.args ?? {});
    };
    window.addEventListener("hashchange", run);
    void run();
    return () => window.removeEventListener("hashchange", run);
  }, [getCtx, showResult, say, ran, openPalette]);
}
