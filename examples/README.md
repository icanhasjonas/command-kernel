# Examples

Each example consumes the published packages exactly as a third-party app would
(`@command-kernel/core`, `/ui`, `/agent`), and shows one or more extension points.

| Example | What it shows | Stack |
|---|---|---|
| [`minimal`](minimal) | the whole loop end to end: register → browse → execute → gate → grant → deeplink → validate → entities → the agent projection | core + agent, console |
| [`playground`](playground) | the full palette + agent demo: drill nav, arg pills, chords, the agent driving the same gate, the self-describing scout | core + ui + agent, React + Vite + Cloudflare |

Run the minimal one:

```bash
bun run --filter '@command-kernel/minimal' start
```

Run the playground:

```bash
bun run dev          # from the repo root -> http://localhost:4319
```
