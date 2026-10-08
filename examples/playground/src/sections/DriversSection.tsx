import { InvokerDriver } from "./drivers/InvokerDriver";
import { LinkDriver } from "./drivers/LinkDriver";
import { PaletteDriver } from "./drivers/PaletteDriver";
import { Code, Panel, Section } from "./Section";

/** Chapter 1: the ways in. Every panel here calls the same `command()`; the trace proves it. */
export function DriversSection() {
  return (
    <Section
      id="drivers"
      title="Many ways in, one verb"
      lede={
        <>
          Each panel below is a different driver. None of them knows what a command does or who may
          run it: they all hand a path and args to <Code>command()</Code> and render the answer. Try
          each one and compare the calls in the trace.
        </>
      }
    >
      <div className="space-y-4">
        <Panel>
          <PaletteDriver />
        </Panel>
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel>
            <LinkDriver />
          </Panel>
          <Panel>
            <InvokerDriver />
          </Panel>
        </div>
      </div>
    </Section>
  );
}
