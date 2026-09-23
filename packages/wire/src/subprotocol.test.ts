import { describe, expect, it } from "bun:test";
import { negotiateSubprotocol } from "./index.js";

/**
 * The upgrade picks the subprotocol: a browser that offered protocols fails the
 * connection when the server echoes none, so the server must echo the one it speaks.
 */

const upgrade = (offered?: string) =>
  new Request("https://x/ws", {
    headers: {
      upgrade: "websocket",
      ...(offered !== undefined && { "sec-websocket-protocol": offered }),
    },
  });

describe("negotiateSubprotocol", () => {
  it("nothing offered: ok, and no header to echo", () => {
    expect(negotiateSubprotocol(upgrade(), "mail.v1")).toEqual({ ok: true });
  });

  it("offered among others: ok, and echoes exactly that one", () => {
    const out = negotiateSubprotocol(upgrade("chat, mail.v1 ,other"), "mail.v1");
    expect(out.ok).toBe(true);
    const headers = new Headers(out.ok ? out.headers : undefined);
    expect(headers.get("sec-websocket-protocol")).toBe("mail.v1");
  });

  it("offered without it: a 400 naming the protocol", async () => {
    const out = negotiateSubprotocol(upgrade("chat, mail.v2"), "mail.v1");
    if (out.ok) throw new Error("expected a refusal");
    expect(out.response.status).toBe(400);
    const body = await out.response.json();
    expect(body.code).toBe("badRequest");
    expect(body.message).toContain("mail.v1");
  });

  it("protocol names are compared exactly (they are case-sensitive tokens)", () => {
    expect(negotiateSubprotocol(upgrade("MAIL.V1"), "mail.v1").ok).toBe(false);
  });
});
