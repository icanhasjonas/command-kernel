# Changesets

This folder holds [changesets](https://github.com/changesets/changesets) -- one
markdown file per pending change, describing which packages bump and why.

The three publishable packages (`@command-kernel/core`, `@command-kernel/agent`,
`@command-kernel/ui`) are a **fixed** group: they version and release together.
The `examples/*` are private and never publish.

```bash
bun x changeset          # write a changeset for your change
bun x changeset version  # apply pending changesets -> bump versions + changelogs
```

Releasing is a deliberate, human-run step; CI does not publish.
