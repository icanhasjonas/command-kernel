import { describe, expect, it } from "bun:test";
import { createKernel } from "./create-kernel";
import { parseDeeplink, serializePath } from "./deeplink";
import type { CommandNode, Ctx, PathSegment } from "./types";

describe("deeplinks — serialize / parse", () => {
  it("round-trips an id chain with tip args", () => {
    const path: PathSegment[] = [
      { id: "users" },
      { id: "users.search", args: { email: "a@b.io" } },
    ];
    const url = serializePath(path);
    expect(url).toBe("cmd/users/users.search?email=a%40b.io");
    expect(parseDeeplink(url)).toEqual([
      { id: "users" },
      { id: "users.search", args: { email: "a@b.io" } },
    ]);
  });

  it("accepts leading #, /, and the cmd prefix", () => {
    const want: PathSegment[] = [{ id: "theme.toggle" }];
    expect(parseDeeplink("cmd/theme.toggle")).toEqual(want);
    expect(parseDeeplink("/cmd/theme.toggle")).toEqual(want);
    expect(parseDeeplink("#/cmd/theme.toggle")).toEqual(want);
    expect(parseDeeplink("theme.toggle")).toEqual(want);
  });

  it("never serializes evidence (a URL can't carry a grant)", () => {
    const path: PathSegment[] = [
      { id: "reset", args: { user: "a@b.io" }, evidence: { nonce: "n", sig: "s" } },
    ];
    expect(serializePath(path)).toBe("cmd/reset?user=a%40b.io");
  });
});

describe("deeplink security — a gated command can't auto-fire from a URL", () => {
  const ctx: Ctx = {
    location: { module: "home" },
    user: { id: "u1", name: "T", role: "admin", brand: "circle" },
    now: 0,
    frecency: {},
  };
  const reset: CommandNode = {
    id: "reset",
    title: "Send password reset",
    gate: { roles: ["admin"], confirm: true },
    args: [{ id: "user", label: "user", kind: "email", required: true }],
    run: async (a) => ({ kind: "toast", message: `reset ${a.user}` }),
  };

  it("executing a parsed deeplink to a gated command returns a gate, not a result", async () => {
    const kernel = createKernel({ roots: [reset] });
    const path = parseDeeplink("cmd/reset?user=a@b.io");
    const res = await kernel.command({ path, execute: true }, ctx);
    // the URL carried args but NO grant -> the kernel demands approval
    expect(res.kind).toBe("gate");
  });

  it("a pure (ungated) deeplink runs straight through", async () => {
    const ping: CommandNode = {
      id: "ping",
      title: "Ping",
      run: async () => ({ kind: "toast", message: "pong" }),
    };
    const kernel = createKernel({ roots: [ping] });
    const res = await kernel.command({ path: parseDeeplink("cmd/ping"), execute: true }, ctx);
    expect(res.kind).toBe("result");
  });
});
