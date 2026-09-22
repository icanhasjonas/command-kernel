/**
 * The host globals @command-kernel/core and @command-kernel/wire rely on, and nothing
 * more: the part of the web platform every target runtime provides (browsers, Bun,
 * Node 20+, Cloudflare Workers). Used ONLY by `tsconfig.nodom.json`, which typechecks
 * both packages' sources against ES2023 plus this file, with no DOM lib and no runtime
 * types, as a consumer building for Workers does. A global the packages start using
 * that is not declared here fails `bun run check`: declare it here on purpose, or
 * do not use it.
 *
 * `crypto` is deliberately NOT declared: a consumer's lib may not declare it either,
 * so core reads it through an untyped probe (evidence.ts `randomBytes`).
 */

// timers: the handle is opaque (a number in a browser, an object in Bun and Node)
declare function setTimeout(handler: () => void, ms?: number): unknown;
declare function clearTimeout(id: unknown): void;
declare function setInterval(handler: () => void, ms?: number): unknown;
declare function clearInterval(id: unknown): void;

declare class TextEncoder {
  encode(input?: string): Uint8Array;
}
declare class TextDecoder {
  decode(input?: Uint8Array): string;
}

declare class URLSearchParams {
  append(name: string, value: string): void;
  has(name: string): boolean;
  keys(): IterableIterator<string>;
  getAll(name: string): string[];
  toString(): string;
}
declare class URL {
  constructor(url: string);
  readonly pathname: string;
  readonly searchParams: URLSearchParams;
}

interface AbortSignal {
  readonly aborted: boolean;
  addEventListener(type: "abort", listener: () => void, options?: { once?: boolean }): void;
  removeEventListener(type: "abort", listener: () => void): void;
}
declare class AbortController {
  readonly signal: AbortSignal;
  abort(reason?: unknown): void;
}

interface Headers {
  get(name: string): string | null;
}
type HeadersInit = Record<string, string> | Headers;

interface ReadableStreamReadResult {
  done: boolean;
  value?: Uint8Array;
}
interface ReadableStream {
  getReader(): { read(): Promise<ReadableStreamReadResult>; cancel(): Promise<void> };
}

interface RequestInit {
  method?: string;
  headers?: HeadersInit;
  body?: string;
  signal?: AbortSignal;
}
declare class Request {
  readonly url: string;
  readonly method: string;
  readonly headers: Headers;
  readonly body: ReadableStream | null;
}
declare class Response {
  constructor(body?: string | null, init?: { status?: number; headers?: HeadersInit });
  readonly status: number;
  readonly ok: boolean;
  readonly headers: Headers;
  text(): Promise<string>;
}
declare function fetch(url: string, init?: RequestInit): Promise<Response>;
