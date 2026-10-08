---
"@command-kernel/ui": minor
---

Icons resolve by REGISTERED name: `registerIcons({ Mail, Users })` once at startup, and
`iconFor(name)` to check one. `Icon` used to look names up in all of lucide, which put
every icon in every app that renders a palette: `import { CommandPalette }` cost 267 kB
gzipped and now costs 79. An unregistered name draws a plain circle, as an unknown name
did before. Upgrading: register the icons your commands and options name.
