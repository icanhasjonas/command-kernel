---
"@command-kernel/core": minor
"@command-kernel/agent": minor
"@command-kernel/ui": minor
---

Pipes: one command's output is the next command's input.

- `CommandNode.output` (what a run hands on, as `CommandResult.value`), `input` (which
  arg a piped value lands in when two fit) and `subject` (a node that stands for a value).
- `CommandRequest.input` binds a piped value into the tip's args before validation, the
  gate and signing: no new trust path, and the grant covers the value.
- `kernel.actionsFor(type, ctx, query?)` lists every command that takes a value, over free
  branches; `kernel.pipe({ input, steps })` type-checks a whole pipe before anything runs
  and pauses resumably on args or approval.
- Audit records carry `input`; `replay` binds it again.
- Agent: a node with `output` gets an MCP `outputSchema` (`{ value }`); results carry
  `value`.
- Palette: Tab on a subject row opens pipe mode; a command with an `output` keeps the
  palette open on what it made. New labels: `pipeInto`, `pipeNothing`, `pipeLandsIn`,
  `hintPipe`.
- Fix: `theme.css` now carries `@source` for the palette's own files, so Tailwind
  generates its classes in a consuming app.
