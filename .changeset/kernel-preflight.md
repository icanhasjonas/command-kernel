---
"@command-kernel/core": minor
---

`kernel.preflight(node, ctx, args?)`: the gate's answer before the args are in, so a
driver can say "admin only" before asking for a user instead of after. Advice, never
permission: it runs no evidence, no policy and no `run`, and `executeNode` asks the
whole gate again with the real args.

`EntityType.acceptsLabel` names what `accepts` takes, for the refusal: `"x" is not a
person or an address`. `freeValueError(ref, value, entities)` is that same rule, exported
so a driver can ask it while a value is typed. An `open` entity arg's JSON schema says it
also takes a hand-typed value.
