import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE BOUNDARY, proven with tests.
 *
 * The covenant: @command-kernel/core (and the headless /agent) import ZERO
 * framework, and a driver can never reach a core internal the public surface
 * doesn't expose. Two things make that PHYSICAL, and this file asserts both:
 *
 *  1. Dependency + import purity — core/agent declare no framework dependency and
 *     their source imports no framework module. So `bun add @command-kernel/core`
 *     standalone cannot even resolve React; importing it in core fails for real.
 *  2. A sealed `exports` map — only "." is exported, so a deep import like
 *     `@command-kernel/core/gate` is unresolvable by Node, bundlers, AND tsc.
 *     The boundary is the package manifest, not a lint rule.
 */

const ROOT = join(import.meta.dir, "..");

// modules a pure, headless package must never pull in
const FRAMEWORK = [
  "react",
  "react-dom",
  "framer-motion",
  "lucide-react",
  "@radix-ui/",
  "@opentui/",
  "vue",
  "svelte",
  "solid-js",
  "preact",
  "@command-kernel/ui",
  "@command-kernel/react",
];

function isFramework(spec: string): boolean {
  return FRAMEWORK.some((f) => (f.endsWith("/") ? spec.startsWith(f) : spec === f));
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

function importSpecifiers(file: string): string[] {
  const src = readFileSync(file, "utf8");
  const specs: string[] = [];
  for (const m of src.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) {
    // a real module specifier has no whitespace — this rejects the word "from"
    // appearing inside a string literal (e.g. a test description ending in "from")
    if (m[1] && !/\s/.test(m[1])) specs.push(m[1]);
  }
  return specs;
}

function pkg(name: "core" | "agent" | "ui" | "wire" | "react"): Record<string, unknown> {
  return JSON.parse(readFileSync(join(ROOT, "packages", name, "package.json"), "utf8"));
}

function depNames(p: Record<string, unknown>): string[] {
  const fields = ["dependencies", "peerDependencies"];
  const names: string[] = [];
  for (const f of fields) {
    const obj = p[f] as Record<string, string> | undefined;
    if (obj) names.push(...Object.keys(obj));
  }
  return names;
}

describe("kernel purity (core + agent + wire are headless)", () => {
  for (const name of ["core", "agent", "wire"] as const) {
    it(`@command-kernel/${name} declares no framework runtime dependency`, () => {
      const offenders = depNames(pkg(name)).filter(isFramework);
      expect(offenders).toEqual([]);
    });

    it(`@command-kernel/${name} source imports no framework module`, () => {
      const offenders: string[] = [];
      for (const file of sourceFiles(join(ROOT, "packages", name, "src"))) {
        for (const spec of importSpecifiers(file)) {
          if (isFramework(spec)) offenders.push(`${file} -> ${spec}`);
        }
      }
      expect(offenders).toEqual([]);
    });
  }

  it("core source imports nothing outside itself (only ./relative)", () => {
    const escapes: string[] = [];
    for (const file of sourceFiles(join(ROOT, "packages", "core", "src"))) {
      for (const spec of importSpecifiers(file)) {
        const local = spec.startsWith("./");
        const builtin = spec.startsWith("bun:") || spec.startsWith("node:");
        if (!local && !builtin) escapes.push(`${file} -> ${spec}`);
      }
    }
    expect(escapes).toEqual([]);
  });

  it("core source touches no DOM global (window, document, KeyboardEvent, ...)", () => {
    // Types AND runtime: core must compile with lib:["ES2022"] alone and run
    // headless. The one sanctioned escape hatch is a structural peek through
    // `globalThis` (platform sniffing) — anything else is a driver leaking in.
    const DOM_GLOBAL =
      /\b(window|document|KeyboardEvent|MouseEvent|HTMLElement|Element|Node|addEventListener|removeEventListener|localStorage|fetch)\b/;
    const offenders: string[] = [];
    for (const file of sourceFiles(join(ROOT, "packages", "core", "src"))) {
      if (file.endsWith(".test.ts")) continue;
      const code = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
        .split("\n");
      code.forEach((line, i) => {
        const stripped = line.replace(/\/\/.*$/, ""); // line comments
        const m = DOM_GLOBAL.exec(stripped);
        if (m && !stripped.includes("globalThis")) offenders.push(`${file}:${i + 1} -> ${m[1]}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  for (const name of ["agent", "wire"] as const) {
    it(`${name} depends only on core (one allowed cross-package edge)`, () => {
      const external = depNames(pkg(name)).filter((d) => !d.startsWith("@command-kernel/"));
      expect(external).toEqual([]);
      expect(depNames(pkg(name))).toEqual(["@command-kernel/core"]);
    });
  }

  it("react depends on core and React, nothing else (no radix, no motion, no styling)", () => {
    expect(depNames(pkg("react")).sort()).toEqual(["@command-kernel/core", "react"]);
  });
});

describe("sealed exports (deep imports are physically unresolvable)", () => {
  for (const name of ["core", "agent", "ui", "wire", "react"] as const) {
    it(`@command-kernel/${name} exposes no deep code subpath`, () => {
      // ui also ships its CSS token sheet — an intentional public asset, not a
      // reachable internal. Code stays sealed behind "." everywhere.
      const allowed = name === "ui" ? [".", "./theme.css"] : ["."];
      const p = pkg(name);
      const exportsMap = p.exports as Record<string, unknown>;
      expect(Object.keys(exportsMap)).toEqual(allowed);
      // the publish-time map must be sealed too (no deep/wildcard subpaths)
      const publish = p.publishConfig as { exports?: Record<string, unknown> } | undefined;
      if (publish?.exports) expect(Object.keys(publish.exports)).toEqual(allowed);
    });
  }

  it("the dependency arrow points one way: ui -> core, never core -> ui", () => {
    expect(depNames(pkg("ui"))).toContain("@command-kernel/core");
    expect(depNames(pkg("core"))).not.toContain("@command-kernel/ui");
    expect(depNames(pkg("core"))).not.toContain("@command-kernel/react");
  });
});
