import { beforeEach, describe, expect, it } from "bun:test";
import { WireCallError, type WireClient } from "@command-kernel/wire";
import { traceStore } from "../../trace/trace-store";
import { flipFlag, labStatus, rotateKey } from "../../wire/spec";
import type { Attempt } from "../lab-ui";
import { labCall } from "./call";

/** A wire client whose every call answers `outcome` (a value, or a WireCallError to throw). */
function client(outcome: unknown): WireClient {
  const call = async () => {
    if (outcome instanceof WireCallError) throw outcome;
    return outcome;
  };
  // only `call` is reached by labCall; the rest of the client is not part of this test
  return { call } as unknown as WireClient;
}

const grant = { nonce: "n1", sig: "ab".repeat(32), expiresAt: Date.now() + 60_000 };
const signing = { key: "signing" } as const;

describe("labCall: every wire call is accounted for", () => {
  let logged: Attempt[];
  const log = (a: Attempt) => logged.push(a);
  beforeEach(() => {
    logged = [];
    traceStore.clear();
  });

  it("a success is logged too, not only a refusal (a grant's first use must show)", async () => {
    await labCall(client({ key: "signing", fingerprint: "cafe0001" }), rotateKey, signing, {
      via: "auto",
      evidence: grant,
      label: "Use it twice",
      log,
      done: (o) => o.fingerprint,
    });
    expect(logged).toEqual([{ label: "Use it twice", answer: "ran", detail: "cafe0001" }]);
    expect(traceStore.snapshot()[0]).toMatchObject({
      driver: "wire",
      outcome: "ran",
      grant: "verified",
    });
  });

  it("a refused grant reads as owed again, for the reason the attempt gave it", async () => {
    const owed = new WireCallError({ code: "confirmRequired", message: "owed", status: 409 });
    await labCall(client(owed), rotateKey, signing, {
      via: "auto",
      evidence: grant,
      label: "Forge",
      log,
      grantWhy: "the signature no longer matches",
    });
    expect(logged[0]).toMatchObject({
      answer: "owed",
      detail: "the signature no longer matches, so the server owes the approval again",
    });
    expect(traceStore.snapshot()[0]).toMatchObject({ outcome: "owed", grant: "refused" });
  });

  it("a call the network stopped never reached a kernel", async () => {
    const down = new WireCallError({ code: "disconnected", message: "gone", status: 0 });
    await labCall(client(down), flipFlag, { flag: "maintenance" } as const, {
      via: "auto",
      label: "Flip",
      log,
    });
    expect(logged[0]).toMatchObject({ answer: "unreached", detail: "no answer disconnected" });
    expect(traceStore.snapshot()[0]?.outcome).toBe("unreached");
  });

  it("the page's own read on connect stays out of both logs", async () => {
    await labCall(client({}), labStatus, {}, { via: "auto", label: "status", log, quiet: true });
    expect(logged).toEqual([]);
    expect(traceStore.snapshot()).toEqual([]);
  });
});
