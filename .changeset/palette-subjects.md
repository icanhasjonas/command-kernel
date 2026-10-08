---
"@command-kernel/ui": minor
---

The palette finds things, not only commands, and lands where it should:

- `subjects={["person", "file"]}`: at the root a query also searches those entity types;
  each hit is a row for that thing, and picking it lists what can take it (a pipe).
- `trigger` carries `values`: a jump that already knows some args (a deeplink's) asks
  only for the rest, or goes straight to the confirm.
- An arg the schema refuses returns to that arg with the reason, cleared for a new
  value. It used to show the permission lock ("escalate to an admin").
- An option without an icon draws none instead of a placeholder circle.
