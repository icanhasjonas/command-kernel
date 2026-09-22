/**
 * @command-kernel/wire -- driver #6, headless.
 *
 * Every command in a kernel, callable over HTTP and over a WebSocket, through the
 * same `kernel.command(...)` and the same gate. The server half is transport-neutral
 * (the host owns sockets and auth); the client half reconnects, times out, falls
 * back to HTTP, and receives server-pushed events. Declarations are shared by both
 * sides and generate the reference docs.
 */

export {
  type CallOpts,
  createWireClient,
  type WireClient,
  type WireClientOptions,
} from "./client.js";
export { WireCallError } from "./client-error.js";
export type { StatusChange, StatusListener } from "./client-listeners.js";
export type { ConnectionStatus, WebSocketLike } from "./connection.js";
export {
  type DeclaredNode,
  defineCommand,
  defineEvent,
  type EventSpec,
  type HttpRoute,
  implement,
  type SpecOptions,
  type WireSpec,
} from "./define.js";
export {
  commandManifest,
  type DocSpec,
  type Manifest,
  type ManifestCommand,
  renderCommandDocs,
} from "./docs.js";
export {
  type CallFrame,
  ERROR_STATUS,
  type ErrFrame,
  EVIDENCE_HEADER,
  type EventFrame,
  encodeFrame,
  type OkFrame,
  RESULT_KIND_HEADER,
  type ServerFrame,
  serverStatus,
  statusOf,
  type WireError,
} from "./protocol.js";
export { fillRoute, matchRoute } from "./route.js";
export { createWireServer, type WireServer, type WireServerOptions } from "./server.js";
export { negotiateSubprotocol, type SubprotocolAnswer } from "./subprotocol.js";
