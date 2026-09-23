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

  // ── the gate ──────────────────────────────────────────────────────────────
  /** headline when the gate said no */
  gateBlocked: string;
  /** headline when the gate said yes but a confirm is owed */
  gateConfirm: string;
  /** one verdict check */
  check: (label: string) => string;
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
  noMatch: (query) => (query ? `no commands match “${query}”` : "no commands"),

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

  gateBlocked: "You can't run this here",
  gateConfirm: "This command is gated - confirm to continue",
  check: (label) => `requires ${label}`,
  yourRole: (role) => `you: ${role}`,
  needsConfirm: "requires explicit confirm",
  blockedHint: "back - escalate to an admin to proceed",
  confirmRun: "Confirm & run",

  hintSelect: "select",
  hintConfirm: "confirm",
  hintCancel: "cancel",
  hintDrill: "drill in",
  hintRunAsPage: "run as page",
  hintBack: "back",
  chordHint: (modKey) => <>hold {modKey} for chords</>,
};

/** Merge a consumer's overrides over the defaults. Absent keys keep the default. */
export function resolveLabels(overrides?: PaletteLabelOverrides): PaletteLabels {
  return overrides ? { ...defaultLabels, ...overrides } : defaultLabels;
}
