---
"@command-kernel/core": minor
"@command-kernel/agent": patch
"@command-kernel/ui": patch
---

Typed args, arg-aware gates, structured results and errors.

- `ArgKind` gains `number`, `boolean` and `json`. A `json` arg declares `ArgSpec.schema`: the
  value is checked against it, and `toJsonSchema` emits it (with the arg's label) to agents.
- Text from a palette, a deeplink or a model is coerced to the declared type (`coerceArgs`)
  on every hop of a path and in `executeNode`. A `json` arg is coerced by its schema. Only
  plain decimal text becomes a number. Blank text on a typed arg means "no value".
- Presence is by kind: `false`, `0` and an empty JSON list are values.
- `GatePolicy` receives the effective args as a third parameter. Two-parameter policies are
  unaffected.
- `ResultKind` gains `"data"` (`payload` is the answer). `CommandError(code, message,
  details)` and `isCommandError` let a `run()` fail in a form drivers can act on.
- Grants are signed and verified over `signingArgs(node, args)`: declared args coerced, then
  written as text by kind (a `json` value as one canonical JSON string, so list order
  counts). A grant minted from the palette's text verifies the same act arriving typed, and
  a different act (another list order, a number versus the same-looking text on an
  undeclared arg) never does. `kernel.grantFor` and the palette use it.
  `EvidenceStore.grantForPath` stays text-only: use `kernel.grantFor` for typed args.
- Deeplinks: `serializePath(path, { args })` writes a `json` arg as one JSON value.
- Agent projection: object values from a model travel as JSON text.

BREAKING (type level; a 0.x minor, which semver permits): `ArgValue` is now any JSON value
except a bare null, so code that narrows with `typeof v === "string" ? v : v.join()` no
longer compiles. Read values through `argText` / `argList`. Text-only args behave as before
and their grants key exactly as before (text starting with the ASCII record separator
U+001E is escaped). Vendored copies are unaffected until they re-vendor.

Known and unchanged: the palette binds a grant to its ancestor nodes by id only (a search
text is a live filter there, not a bound arg), while `command()` keys each hop with its
args; a grant therefore verifies within the same path shape it was minted in.
