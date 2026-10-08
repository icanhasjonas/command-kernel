import { createKeyboard, parseDeeplink } from "@command-kernel/core";
import { useEffect, useState } from "react";
import { useDemo } from "./demo-context";
import { drivers, kernel, viaLink } from "./kernel";

/** The chord leader: press it, then a command's `chord` key. */
export const CHORD_LEADER = "mod+j";

/**
 * The page-level drivers: the keyboard (⌘K, and ⌘J-then-a-key chords straight into a
 * command) and the URL hash (`#/cmd/<path>` runs that command). Neither decides
 * anything: the keyboard opens the palette on a node, the hash calls `command()`,
 * and a gated command answers with a gate whatever asked.
 */
export function usePageDrivers(): { chordArmed: boolean } {
  const { getCtx, openPalette, showResult, say, ran } = useDemo();
  const [chordArmed, setChordArmed] = useState(false);

  useEffect(() => {
    const kb = createKeyboard();
    // ⌘J armed: the page shows which keys finish a chord until one does, or it times out
    const offChord = kb.subscribeChordMode((prefix) => setChordArmed(prefix !== null));
    kb.pushLayer({ "mod+k": () => openPalette() }, { base: true, id: "palette-launcher" });
    // ⌘J, then the command's key (the GUIDE's leader): a bare ⌘+letter would take
    // the browser's own shortcuts (⌘S save, ⌘F find, ⌘H hide)
    kb.registerShortcuts(
      new Map([...kernel.chords(getCtx())].map(([c, n]) => [`${CHORD_LEADER} ${c}`, n] as const)),
      { onActivate: (n) => openPalette(n.id, "chord") },
    );
    const onKey = (e: KeyboardEvent) => kb.handleKeydown(e);
    window.addEventListener("keydown", onKey);
    return () => {
      offChord();
      window.removeEventListener("keydown", onKey);
    };
  }, [getCtx, openPalette]);

  useEffect(() => {
    const run = async () => {
      const h = window.location.hash.replace(/^#\/?/, "");
      if (!h.startsWith("cmd/")) return;
      const path = parseDeeplink(h);
      // a link is a one-shot call: drop it from the URL so the same link fires again
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      // an approval the link hands to the palette is logged once, by the palette's call
      const res = await drivers.deeplink.command({ path, execute: true }, viaLink(getCtx()));
      if (res.kind === "result") {
        ran(res.node.id);
        showResult(res.result);
        return;
      }
      if (res.kind === "completions") return say("That link names no command", "warn");
      if (res.kind === "gate" && !res.verdict.allowed)
        return say(`"${res.node.title}" is not allowed for your role`, "warn");
      // the link got as far as it could: the palette takes over on that command, with
      // the args the link carried, asking for the rest or for a person's approval
      const given = path[path.length - 1]?.args ?? {};
      openPalette(res.node.id, "deeplink", given);
      // a param the command does not take is left out, and said so, never dropped quietly
      const unknown = Object.keys(given).filter((k) => !res.node.args?.some((a) => a.id === k));
      if (unknown.length > 0)
        say(
          `Ignored ${unknown.join(", ")}: "${res.node.title}" takes no such ${unknown.length > 1 ? "args" : "arg"}`,
          "warn",
        );
    };
    window.addEventListener("hashchange", run);
    void run();
    return () => window.removeEventListener("hashchange", run);
  }, [getCtx, showResult, say, ran, openPalette]);

  return { chordArmed };
}
