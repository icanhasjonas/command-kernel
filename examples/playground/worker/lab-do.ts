import { encodeFrame, serverStatus } from "@command-kernel/wire";
import { DurableObject } from "cloudflare:workers";
import { presence } from "../src/wire/spec";
import { createLab, freshState, type Lab, type LabState, type Visitor } from "./lab";
import { createLimiter, visitorFrom, visitorFromQuery } from "./visitor";

/** The edge's data centre, set by the Worker in front (index.ts); a caller's own value is overwritten. */
export const COLO_HEADER = "x-lab-colo";

interface Attachment {
  visitor: Visitor;
  colo: string;
}

const RATE = { max: 30, windowMs: 10_000 };

const problem = (code: string, message: string) =>
  Response.json(
    {
      type: `urn:command-kernel:error:${code}`,
      title: message,
      code,
      message,
      status: serverStatus(code),
    },
    { status: serverStatus(code), headers: { "content-type": "application/problem+json" } },
  );

/** The id of a frame we refuse before the wire reads it, so the caller's call still settles. */
function idOf(text: string): string | null {
  try {
    const v: unknown = JSON.parse(text);
    return typeof v === "object" && v !== null && "id" in v && typeof v.id === "string"
      ? v.id
      : null;
  } catch {
    return null;
  }
}

/**
 * ONE lab for every visitor: one kernel, one gate, one grant key, one set of flags.
 * HTTP and the socket both reach `lab.wire`, so a command answers the same on either.
 * Sockets hibernate between messages; the client's heartbeat is answered by the runtime
 * without waking this object. The grant key and the state live in this object's own
 * storage, so a grant minted before a hibernation still verifies after it.
 */
export class LabDO extends DurableObject<Env> {
  private lab: Lab | undefined;
  private state: LabState | undefined;
  private readonly limit = createLimiter(RATE.max, RATE.windowMs);

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    ctx.blockConcurrencyWhile(async () => {
      const state = (await ctx.storage.get<LabState>("state")) ?? freshState();
      this.state = state;
      this.lab = createLab({
        key: await this.grantKey(),
        state,
        persist: (s) => ctx.storage.put("state", s),
        spend: (nonce, expiresAt) => this.spend(nonce, expiresAt),
        broadcast: (frame) => this.broadcast(frame),
        online: () => this.visitors(),
      });
    });
  }

  override async fetch(request: Request): Promise<Response> {
    const lab = this.lab;
    if (!lab) return problem("unavailable", "The lab is starting");
    const url = new URL(request.url);
    const colo = request.headers.get(COLO_HEADER) ?? "unknown";
    if (url.pathname === "/ws") return this.upgrade(request, url, colo);

    const visitor = visitorFrom((name) => request.headers.get(name));
    if (!visitor) return problem("unauthorized", "Say who you are: x-lab-visitor and x-lab-role");
    if (!this.limit(visitor.id)) return problem("rateLimited", "Slow down: 30 calls per 10 s");
    this.countCall();
    const res = await lab.wire.handleHttp(request, lab.ctxFor(visitor, Date.now(), colo));
    return res ?? problem("unknownCommand", `Nothing at ${url.pathname}`);
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const lab = this.lab;
    if (!lab) return;
    const text = typeof message === "string" ? message : new TextDecoder().decode(message);
    const { visitor, colo } = ws.deserializeAttachment() as Attachment;
    let answer: string;
    if (!this.limit(visitor.id)) {
      const error = { code: "rateLimited", message: "Slow down: 30 calls per 10 s", status: 429 };
      answer = encodeFrame({ t: "err", id: idOf(text), error });
    } else {
      this.countCall();
      answer = await lab.wire.handleFrame(text, lab.ctxFor(visitor, Date.now(), colo));
    }
    try {
      ws.send(answer);
    } catch {
      // closing; the client reconnects and resyncs
    }
  }

  override webSocketClose(ws: WebSocket, code: number, reason: string): void {
    try {
      ws.close(code, reason);
    } catch {
      // already closed, or a code (1005, 1006) that may not be sent back
    }
    this.sendPresence(ws);
  }

  override webSocketError(ws: WebSocket): void {
    this.sendPresence(ws);
  }

  private upgrade(request: Request, url: URL, colo: string): Response {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket")
      return new Response("expected a WebSocket upgrade", { status: 426 });
    const visitor = visitorFromQuery(url);
    if (!visitor) return new Response("say who you are: ?visitor=&role=", { status: 401 });
    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ visitor, colo } satisfies Attachment);
    this.sendPresence();
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Counted in memory, written with the next change: a call must not cost a storage write. */
  private countCall() {
    if (this.state) this.state.served += 1;
  }

  /**
   * The sockets still open. `getWebSockets()` also holds ones that are closing (a tab
   * that navigated away, React's dev double-mount), which a visitor count must not show.
   */
  private open(except?: WebSocket): WebSocket[] {
    return this.ctx
      .getWebSockets()
      .filter((ws) => ws !== except && ws.readyState === WebSocket.OPEN);
  }

  /** Push a frame to every open socket. */
  private broadcast(frame: string, except?: WebSocket) {
    for (const ws of this.open(except)) {
      try {
        ws.send(frame);
      } catch {
        // closed between the check and the send
      }
    }
  }

  /**
   * Visitors, not sockets: a tab that reconnected, reloaded or double-mounted (React dev)
   * can leave a socket the runtime has not noticed is dead yet; it is the same visitor.
   */
  private visitors(leaving?: WebSocket): number {
    const ids = this.open(leaving).map((ws) => (ws.deserializeAttachment() as Attachment).visitor.id);
    return new Set(ids).size;
  }

  private sendPresence(leaving?: WebSocket) {
    const lab = this.lab;
    if (!lab) return;
    this.broadcast(lab.wire.event(presence.name, { online: this.visitors(leaving) }), leaving);
  }

  /** 32 random bytes made once and kept in this object's storage: they never leave it. */
  private async grantKey(): Promise<Uint8Array> {
    const kept = await this.ctx.storage.get<Uint8Array>("grant-key");
    if (kept) return kept;
    const key = crypto.getRandomValues(new Uint8Array(32));
    await this.ctx.storage.put("grant-key", key);
    return key;
  }

  /** A grant is good once. Spent nonces are kept until they expire, then swept. */
  private async spend(nonce: string, expiresAt: number): Promise<boolean> {
    const k = `spent:${nonce}`;
    if ((await this.ctx.storage.get(k)) !== undefined) return false;
    await this.ctx.storage.put(k, expiresAt);
    const now = Date.now();
    const old = await this.ctx.storage.list<number>({ prefix: "spent:" });
    const gone = [...old].filter(([, exp]) => exp < now).map(([key]) => key);
    if (gone.length > 0) await this.ctx.storage.delete(gone);
    return true;
  }
}
