import type { ReactNode } from "react";

/**
 * Every word the palette says, in one object.
 *
 * Driver #1 ships with English defaults so the zero-config path stays trivial,
 * but NOTHING in the package should name your app, your nouns, or your language.
 * Pass a partial `labels` to `<CommandPalette>` and only the keys you set change:
 *
 *   <CommandPalette labels={{ root: "Acme", placeholder: "Search Acme…" }} ... />
 *
 * Entries that interpolate a value are functions, so a translator controls word
 * order rather than gluing fragments. The two that need markup return a
 * `ReactNode` - override them and you own the styling too.
 */
export interface PaletteLabels {
  // ── the browse frame ──────────────────────────────────────────────────────
  /** breadcrumb for the root frame - the closest thing to an app name */
  root: string;
  /** search input placeholder */
  placeholder: string;
  /** accessible name for the search input (screen readers) */
  searchLabel: string;
  /** empty state when the query matches nothing */
  noMatch: (query: string) => string;

  // ── arg collection ────────────────────────────────────────────────────────
  /** the "2 of 3" counter above the arg pills */
  argCounter: (filled: number, total: number) => string;
  /** placeholder inside a `multiple` arg's input */
  addMore: string;
  /** placeholder for an arg that declares none of its own */
  argPlaceholder: string;
  /** an empty pill's value slot */
  required: string;
  optional: string;
  /** async completion in flight */
  resolving: string;
  /** the "commit what I typed" row */
  freeTextOption: (typed: string) => ReactNode;
  /** no options yet and nothing typed */
  startTyping: string;
  /** nothing typed yet into an arg that has no options to search: a value you write */
  typeValue: string;
  /** an arg that takes only its own options, and what was typed matches none of them */
  noOption: (arg: string, typed: string) => string;

  // ── pipes ─────────────────────────────────────────────────────────────────
  /** search placeholder while a value is in hand (the chip beside it names the value) */
  pipePlaceholder: string;
  /** the search input's accessible name while a value is in hand */
  pipeInto: (value: string) => string;
  /** announced to a screen reader when a value's commands are listed */
  pipeCount: (value: string, count: number) => string;
  /** nothing in the tree takes the value in hand */
  pipeNothing: (value: string) => string;
  /** the arg a routed command will put the value in */
  pipeLandsIn: (arg: string) => string;

  // ── the gate ──────────────────────────────────────────────────────────────
  /** headline when the gate said no */
  gateBlocked: string;
  /** headline when the gate said yes but a confirm is owed */
  gateConfirm: string;
  /** one verdict check; `ok` is whether it passed (a passed check is often the gate's reason) */
  check: (label: string, ok: boolean) => string;
  /** the principal, shown against a failed check */
  yourRole: (role: string) => string;
  /** the standing "this node declares confirm" line */
  needsConfirm: string;
  /** what a blocked human can do about it */
  blockedHint: string;
  /** the primary confirm button */
  confirmRun: string;

  // ── the footer ────────────────────────────────────────────────────────────
  hintSelect: string;
  hintConfirm: string;
  hintCancel: string;
  hintDrill: string;
  hintPipe: string;
  hintRunAsPage: string;
  hintBack: string;
  /** receives the rendered mod key, so word order is yours */
  chordHint: (modKey: ReactNode) => ReactNode;
}

export type PaletteLabelOverrides = Partial<PaletteLabels>;

export const defaultLabels: PaletteLabels = {
  root: "Commands",
  placeholder: "Search commands…",
  searchLabel: "Search commands",
  noMatch: (query) => (query ? `nothing here matches “${query}”` : "nothing here yet"),

  argCounter: (filled, total) => `${filled} of ${total}`,
  addMore: "add… (↵ done)",
  argPlaceholder: "…",
  required: "required",
  optional: "optional",
  resolving: "resolving…",
  freeTextOption: (typed) => (
    <>
      use “<span className="text-white/90">{typed}</span>”
    </>
  ),
  startTyping: "start typing to search…",
  typeValue: "type a value, then ↵",
  noOption: (arg, typed) => `no ${arg} matches “${typed}”: pick one of the options`,

  pipePlaceholder: "Pipe into…",
  pipeInto: (value) => `Pipe ${value} into a command`,
  pipeCount: (value, count) =>
    count === 1 ? `${value}: 1 command can take it` : `${value}: ${count} commands can take it`,
  pipeNothing: (value) => `no command takes ${value}`,
  pipeLandsIn: (arg) => `→ ${arg}`,

  gateBlocked: "You can't run this here",
  // the checks below say why (a gate's reason, or the app's own rule, such as a link)
  gateConfirm: "Needs your OK before it runs",
  check: (label, ok) => (ok ? label : `requires ${label}`),
  yourRole: (role) => `you: ${role}`,
  needsConfirm: "requires explicit confirm",
  blockedHint: "back - escalate to an admin to proceed",
  confirmRun: "Confirm & run",

  hintSelect: "select",
  hintConfirm: "confirm",
  hintCancel: "cancel",
  hintDrill: "drill in",
  hintPipe: "pipe into…",
  hintRunAsPage: "run as page",
  hintBack: "back",
  chordHint: (modKey) => <>hold {modKey} for chords</>,
};

/** Merge a consumer's overrides over the defaults. Absent keys keep the default. */
export function resolveLabels(overrides?: PaletteLabelOverrides): PaletteLabels {
  return overrides ? { ...defaultLabels, ...overrides } : defaultLabels;
}
