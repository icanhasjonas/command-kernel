#!/usr/bin/env bun
// Wrangler honours CLOUDFLARE_API_TOKEN only as a REAL env var — it does not
// read .env, and `bun run` does not propagate .env to spawned binaries. So this
// wrapper loads .env and spawns wrangler with it. Auth is a scoped, non-expiring
// Cloudflare API token (never `wrangler login` — OAuth refresh tokens rotate and
// race). Both CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID live in .env.
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const envPath = join(import.meta.dirname, "..", ".env");
const env: Record<string, string> = { ...(process.env as Record<string, string>) };

if (existsSync(envPath)) {
  for (const raw of readFileSync(envPath, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
}

if (!env.CLOUDFLARE_API_TOKEN) {
  console.error("[wrangler] no CLOUDFLARE_API_TOKEN found in env or .env — see .env.example");
  process.exit(1);
}

const child = spawn("bunx", ["wrangler", ...process.argv.slice(2)], {
  stdio: "inherit",
  env,
});
child.on("exit", (code) => process.exit(code ?? 0));
