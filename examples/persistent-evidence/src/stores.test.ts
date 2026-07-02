import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ArgValues } from "@command-kernel/core";
import { createFileEvidenceStore, createFilePolicyStore, readStoredGrants } from "./stores";

// one temp dir for the whole file; unique filenames per test; cleaned at the end.
const dir = mkdtempSync(join(tmpdir(), "ck-stores-test-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const ARGS: ArgValues = { user: "jon@wall.north" };

test("PolicyStore: always-allow rules survive a fresh store on the same file", () => {
  const file = join(dir, `policy-${Math.random()}.json`);
  const a = createFilePolicyStore(file);
  a.allow({
    commandId: "danger.reset",
    scope: { kind: "arg", argId: "user", value: "jon@wall.north" },
  });

  const b = createFilePolicyStore(file); // simulates a restart
  expect(b.list()).toHaveLength(1);
  expect(b.match("danger.reset", ARGS)).not.toBeNull();
  expect(b.match("danger.reset", { user: "someone@else.io" })).toBeNull();
});

test("EvidenceStore: a grant verifies in its own session", () => {
  const file = join(dir, `ev-${Math.random()}.json`);
  const s = createFileEvidenceStore(file);
  const grant = s.grantForPath([{ id: "danger.reset", args: ARGS }]);
  expect(s.verify(grant, "danger.reset", ARGS, "")).toBe(true);
  // wrong args must not verify -- the grant is bound to the exact call.
  expect(s.verify(grant, "danger.reset", { user: "eve@bad.io" }, "")).toBe(false);
});

test("EvidenceStore: persisted grant does NOT verify in a new session (the property)", () => {
  const file = join(dir, `ev-${Math.random()}.json`);
  const a = createFileEvidenceStore(file);
  a.grantForPath([{ id: "danger.reset", args: ARGS }]);

  const saved = readStoredGrants(file)[0];
  expect(saved).toBeDefined();

  const b = createFileEvidenceStore(file); // fresh salt
  expect(b.verify(saved?.grant, "danger.reset", ARGS, "")).toBe(false);
});

test("EvidenceStore persistSalt:true: a persisted grant replays across sessions", () => {
  const file = join(dir, `ev-salt-${Math.random()}.json`);
  const a = createFileEvidenceStore(file, { persistSalt: true });
  a.grantForPath([{ id: "danger.reset", args: ARGS }]);

  const saved = readStoredGrants(file)[0];
  const b = createFileEvidenceStore(file, { persistSalt: true }); // same salt reloaded
  expect(b.verify(saved?.grant, "danger.reset", ARGS, "")).toBe(true);
});

test("EvidenceStore: rotate() invalidates outstanding grants", () => {
  const file = join(dir, `ev-rot-${Math.random()}.json`);
  const s = createFileEvidenceStore(file);
  const grant = s.grantForPath([{ id: "danger.reset", args: ARGS }]);
  expect(s.verify(grant, "danger.reset", ARGS, "")).toBe(true);
  s.rotate();
  expect(s.verify(grant, "danger.reset", ARGS, "")).toBe(false);
});
