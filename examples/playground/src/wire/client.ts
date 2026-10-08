import { createWireClient, type WebSocketLike, type WireClient } from "@command-kernel/wire";
import { frameStore } from "./frames";
import { type LabRole, ROLE_HEADER, VISITOR_HEADER } from "./spec";

/**
 * The page's wire client to the lab, with a tap on both transports so the page can show
 * every frame exactly as it was sent and received. The tap only records: the client,
 * its reconnects, its heartbeat and its HTTP fallback are the library's own.
 */

const KEY = "lab-visitor";

/** This tab's visitor id: random, kept for the tab's life, never anything about you. */
export function visitorId(): string {
  const kept = sessionStorage.getItem(KEY);
  if (kept) return kept;
  const id = [...crypto.getRandomValues(new Uint8Array(8))]
    .map((b) => b.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 12);
  sessionStorage.setItem(KEY, id);
  return id;
}

const HEARTBEAT = new Set(["ping", "pong"]);

/** The browser's WebSocket, with its sends and messages copied to the frame log. */
function tappedSocket(url: string): WebSocketLike {
  const ws = new WebSocket(url);
  const send = ws.send.bind(ws);
  ws.send = (data: string) => {
    if (!HEARTBEAT.has(data)) frameStore.record({ dir: "out", via: "ws", text: data });
    send(data);
  };
  ws.addEventListener("message", (e) => {
    const text = String(e.data);
    if (!HEARTBEAT.has(text)) frameStore.record({ dir: "in", via: "ws", text });
  });
  // the DOM's WebSocket is a WebSocketLike; only its handler `this`/event types are narrower
  // than the structural shape the wire package declares (it ships no DOM types)
  return ws as unknown as WebSocketLike;
}

/** fetch, with each request and its answer copied to the frame log. */
async function tappedFetch(url: string, init?: RequestInit): Promise<Response> {
  const path = new URL(url, location.href).pathname;
  const body = typeof init?.body === "string" ? init.body : "";
  frameStore.record({
    dir: "out",
    via: "http",
    head: `${init?.method ?? "GET"} ${path}`,
    text: body,
  });
  const res = await fetch(url, init);
  const text = await res.clone().text();
  frameStore.record({ dir: "in", via: "http", head: `${res.status} ${res.statusText}`, text });
  return res;
}

export function createLabClient(role: LabRole): WireClient {
  const visitor = visitorId();
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  return createWireClient({
    http: "/api",
    ws: `${scheme}://${location.host}/ws?visitor=${visitor}&role=${role}`,
    socket: tappedSocket,
    fetch: tappedFetch,
    headers: () => ({ [VISITOR_HEADER]: visitor, [ROLE_HEADER]: role }),
    timeoutMs: 8000,
  });
}
