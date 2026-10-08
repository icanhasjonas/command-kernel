---
"@command-kernel/ui": minor
---

The palette on a phone, and for a screen reader:

- The confirm screen stacks its two choices full width on a narrow screen, so nothing
  wraps or clips at 390px. Its keys are said once, in the footer.
- A footer hint names a key that does something: no "↵ confirm" on a blocked gate, no
  "→ drill in" on a row that cannot drill.
- A gated row shows the roles its gate declares ("admin") beside the lock, before any
  arg is asked for.
- The backdrop dims without blurring the page: one blur less to repaint per keystroke.
- No `use "…"` row for an entity arg that must exist (not `open`): the kernel refuses it.
- Text a closed arg has no option for says so (`noOption`, new label) and keeps every
  option in view, instead of an empty list that swallows Enter.
- `gateConfirm` reads "Needs your OK before it runs": a confirm can come from the app's
  own rule (a link), not only a declared gate. `noMatch` no longer says "commands"
  inside a scope of people.
- On a phone a row drops its category, roles and lands-in chip so the title fits.
- Enter on an arg commits only rows found for what is typed now: type an address fast
  and press Enter, and it waits for the search instead of taking the stale first row.
- An unmatched closed arg highlights nothing and Enter commits nothing until a row is
  chosen (arrow keys or a click).
- A back button (`back` label) beside the breadcrumb: Esc for a touch screen.
- Row key badges (`tab`, a chord key) hide on a touch screen, like the footer.
- An arg with nothing to search says `typeValue` ("type a value, then ↵") instead of
  "start typing to search…". New label, overridable like the rest.
- Each arg's input is named by its label (`aria-label`).
