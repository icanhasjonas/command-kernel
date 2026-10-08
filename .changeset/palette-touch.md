---
"@command-kernel/ui": minor
---

The palette on a phone, and for a screen reader:

- The confirm screen stacks its two choices full width on a narrow screen, and drops
  the key hints there, so nothing wraps or clips at 390px.
- Row key badges (`tab`, a chord key) hide on a touch screen, like the footer.
- An arg with nothing to search says `typeValue` ("type a value, then ↵") instead of
  "start typing to search…". New label, overridable like the rest.
- Each arg's input is named by its label (`aria-label`).
