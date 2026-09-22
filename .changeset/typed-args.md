---
"@command-kernel/core": minor
"@command-kernel/agent": patch
---

Typed args, arg-aware gates, structured results and errors.

- `ArgKind` gains `number`, `boolean` and `json` (with `ArgSpec.schema`, a JSON Schema the
  value is checked against and that `toJsonSchema` emits as-is). `ArgValue` widens to carry
  them. Text from a palette or a deeplink is coerced to the declared type (`coerceArgs`)
  before validation, in `command()` and in `executeNode`.
- `GatePolicy` receives the effective args as a third parameter, so a policy can decide on
  what is being touched. Existing two-parameter policies are unaffected.
- `ResultKind` gains `"data"`: `payload` is the answer, `message` a one-line summary.
- `CommandError(code, message, details)` and `isCommandError`: a `run()` says why it failed
  in a form drivers can act on.
- Grants over text-only args hash exactly as before; typed values key as canonical JSON.
- Agent projection: object values from a model travel as JSON text, so `json` args survive.

Migration: code that assumed every `ArgValue` is `string | string[]` should read values
through `argText` / `argList`, which accept every kind.
