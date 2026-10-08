import type { PaletteLabelOverrides } from "@command-kernel/ui";
import { CommandPalette } from "@command-kernel/ui";
import { useMemo } from "react";
import { ChordHint } from "./ChordHint";
import { DemoProvider, useDemo } from "./demo/demo-context";
import { drivers, viaLink } from "./demo/kernel";
import { usePageDrivers } from "./demo/use-drivers";
import { ROOTS } from "./providers/registry";
import { AgentSection } from "./sections/AgentSection";
import { DriversSection } from "./sections/DriversSection";
import { GateSection } from "./sections/GateSection";
import { Header } from "./sections/Header";
import { Hero } from "./sections/Hero";
import { Packages } from "./sections/Packages";
import { PipesSection } from "./sections/PipesSection";
import { SchemaSection } from "./sections/SchemaSection";
import { WireSection } from "./sections/WireSection";
import { Toast } from "./Toast";
import { Inspector } from "./trace/Inspector";
import { MobileTrace } from "./trace/MobileTrace";

// The demo's voice lives HERE, in the consumer: @command-kernel/ui ships neutral
// English defaults ("Commands", "Search commands…") and names no app.
const PALETTE_LABELS: PaletteLabelOverrides = {
  root: "Backoffice",
  placeholder: "Search commands, people, files…",
  searchLabel: "Search the backoffice",
};

/** What a root search finds besides commands: people and files, each a value to act on. */
const SUBJECTS = ["person", "file"] as const;

function Page() {
  const { chordArmed } = usePageDrivers();
  const { ctx, palette, closePalette, showResult, ran } = useDemo();
  // a link the palette took over is still a link: the gate asks before it writes
  const paletteCtx = useMemo(
    () => (palette.via === "deeplink" ? viaLink(ctx) : ctx),
    [palette.via, ctx],
  );
  return (
    <>
      <Header />
      <div className="mx-auto grid max-w-[1320px] gap-10 px-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* below lg the trace pill floats bottom-right: the page ends above it */}
        <main className="min-w-0 pb-24 lg:pb-0">
          <Hero />
          <DriversSection />
          <AgentSection />
          <GateSection />
          <WireSection />
          <SchemaSection />
          <PipesSection />
          <Packages />
        </main>
        <aside className="hidden lg:block">
          {/* the header grows (a section row below xl, the lab's banner): the rail follows it */}
          <div className="sticky top-[calc(var(--header-h)+16px)] flex h-[calc(100vh-var(--header-h)-40px)] pt-16">
            <Inspector className="min-h-0 flex-1" />
          </div>
        </aside>
      </div>
      <MobileTrace />
      <CommandPalette
        open={palette.open}
        kernel={drivers[palette.via]}
        ctx={paletteCtx}
        roots={ROOTS}
        trigger={palette.trigger}
        subjects={SUBJECTS}
        labels={PALETTE_LABELS}
        onClose={closePalette}
        onResult={showResult}
        onExecuted={ran}
      />
      <Toast />
      <ChordHint armed={chordArmed} />
    </>
  );
}

export default function App() {
  return (
    <DemoProvider>
      <Page />
    </DemoProvider>
  );
}
