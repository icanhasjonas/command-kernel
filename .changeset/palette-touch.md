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
- Row key badges (`tab`, a chord key) hide on a touch screen, like the footer.
- An arg with nothing to search says `typeValue` ("type a value, then ↵") instead of
  "start typing to search…". New label, overridable like the rest.
- Each arg's input is named by its label (`aria-label`).
