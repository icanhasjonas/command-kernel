import type { PaletteLabelOverrides } from "@command-kernel/ui";
import { CommandPalette } from "@command-kernel/ui";
import { DemoProvider, useDemo } from "./demo/demo-context";
import { drivers } from "./demo/kernel";
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
  placeholder: "Search commands, people, files, submissions…",
  searchLabel: "Search the backoffice",
};

/** What a root search finds besides commands: people and files, each a value to act on. */
const SUBJECTS = ["person", "file"] as const;

function Page() {
  usePageDrivers();
  const { ctx, palette, closePalette, showResult, ran } = useDemo();
  return (
    <>
      <Header />
      <div className="mx-auto grid max-w-[1320px] gap-10 px-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <main className="min-w-0">
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
          <div className="sticky top-[76px] flex h-[calc(100vh-100px)] pt-16">
            <Inspector className="min-h-0 flex-1" />
          </div>
        </aside>
      </div>
      <MobileTrace />
      <CommandPalette
        open={palette.open}
        kernel={drivers[palette.via]}
        ctx={ctx}
        roots={ROOTS}
        trigger={palette.trigger}
        subjects={SUBJECTS}
        labels={PALETTE_LABELS}
        onClose={closePalette}
        onResult={showResult}
        onExecuted={ran}
      />
      <Toast />
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
