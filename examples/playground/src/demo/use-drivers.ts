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
      const res = await drivers.deeplink.command(
        { path: parseDeeplink(h), execute: true },
        getCtx(),
      );
      if (res.kind === "result") {
        ran(res.node.id);
        showResult(res.result);
      } else if (res.kind === "gate")
        say(`"${res.node.title}" is gated: a URL can carry args, never an approval`, "warn");
      else if (res.kind === "args")
        say(
          `The link is missing ${[...res.missing, ...res.errors.map((e) => e.argId)].join(", ")}`,
          "warn",
        );
      else if (res.kind === "completions") say("That link names no command", "warn");
    };
    window.addEventListener("hashchange", run);
    void run();
    return () => window.removeEventListener("hashchange", run);
  }, [getCtx, showResult, say, ran]);
}
