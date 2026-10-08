import { Icon } from "@command-kernel/ui";
import { ICON } from "../providers/workspace";
import { PipeRun } from "./pipes/PipeRun";
import { PRESETS } from "./pipes/presets";
import { Code, Panel, Section } from "./Section";

const TREE: { name: string; depth: number; icon: string; note: string }[] = [
  { name: "file", depth: 0, icon: "File", note: "abstract: no catalog of its own" },
  { name: "document", depth: 1, icon: ICON.document, note: "Load as text takes these" },
  { name: "media-file", depth: 1, icon: ICON["media-file"], note: "Make thumbnail takes these" },
  { name: "image", depth: 2, icon: ICON.image, note: "an image is media, and a file" },
];

/** Chapter 5: commands compose. A typed value flows from one command into the next. */
export function PipesSection() {
  return (
    <Section
      id="pipes"
      index="05 · pipes"
      title="One command's output is the next one's input"
      lede={
        <>
          A command declares what it produces (<Code>output</Code>), and the next command takes it
          in whichever arg accepts that shape. Values are typed by registered <em>shapes</em>: a
          media file is a file, a file is not a media file. A pipe is checked end to end before step
          one runs, and every step is an ordinary call: gated, signed, traced.
        </>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
        <Panel className="p-5">
          <h3 className="font-medium text-[13px] text-white/85">Shapes</h3>
          <ul className="mt-3 space-y-2.5">
            {TREE.map((t) => (
              <li key={t.name} style={{ paddingLeft: t.depth * 18 }}>
                <div className="flex items-center gap-2 font-mono text-[13px] text-white/85">
                  <Icon name={t.icon} size={14} className="text-teal-soft" /> {t.name}
                </div>
                <div className="mt-0.5 pl-6 text-[12px] text-white/45">{t.note}</div>
              </li>
            ))}
          </ul>
          <pre className="mt-4 overflow-x-auto rounded-lg bg-black/30 p-2.5 font-mono text-[11px] leading-relaxed text-white/60">
            {`{ name: "image",\n  extends: "media-file",\n  search, get }`}
          </pre>
        </Panel>
        <div className="space-y-3">
          {PRESETS.map((p) => (
            <PipeRun key={p.id} preset={p} />
          ))}
          <p className="text-[13px] text-white/50">
            In the palette: open Files, highlight a file, press <Code>tab</Code>. You get every
            command that takes that shape, and each result offers the next step.
          </p>
        </div>
      </div>
    </Section>
  );
}
