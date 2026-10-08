---
"@command-kernel/core": minor
---

An entity arg takes an entity. At the args stage, before any gate or run, in
`command()` AND in `executeNode` (the lower verb a palette calls), so no driver skips it:

- a value no registered entity matches is an arg error (`no person matches "x"`); it
  used to run with the string as given.
- every value of a `multiple` entity arg is resolved like a single one (an id, or the
  one search match); a value matching several is an error there, since a list has no
  single pick to ask for. They used to pass unchecked.
- `entity: { type, open: true }` keeps the old leniency for an arg that means it: a
  value typed by hand that is nobody in the catalog (an address to email).

If an entity arg of yours takes free values, mark it `open: true`.
