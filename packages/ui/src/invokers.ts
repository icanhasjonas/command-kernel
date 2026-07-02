import type {
  CommandResponse,
  Ctx,
  DeeplinkOptions,
  Kernel,
  PathSegment,
} from "@command-kernel/core";
import { parseDeeplink, serializePath } from "@command-kernel/core";

/**
 * DRIVER #5 — the DOM invoker. The native HTML Invoker Commands API
 * (`<button command="..." commandfor="...">`, Baseline 2026) turned into a
 * command-kernel driver.
 *
 * A `command` whose value starts with `--` is a CUSTOM command: the browser does
 * NO built-in work, it just dispatches a `CommandEvent` on the controlled element
 * (the `commandfor` target). We listen for that one event on a single host and
 * route it through the SAME `kernel.command()` + gate as the palette, the agent,
 * and the deeplink driver. HTML markup becomes a command surface.
 *
 * THE CAVEAT, made honest: a `CommandEvent` carries NO arg payload — only the
 * command string and the source button. So we encode the whole addressed path IN
 * the command string by REUSING the deeplink serializer (the keystone). The value
 * `--ck:cmd/users.send_reset?user=jon@wall.north` is just `INVOKER_PREFIX` + a
 * deeplink; `parseInvoker` strips the prefix and hands the rest to `parseDeeplink`.
 * One schema, four surfaces, still.
 *
 * THE SECURITY PROPERTY falls out for free: the markup carries args but never a
 * grant (the session salt never leaves the kernel). A `<button>` into a gated
 * command can't auto-fire — `kernel.command(...)` returns a `gate` and the driver
 * routes the human to approval, exactly like a gated deeplink.
 */

/** The custom-command namespace. Native custom commands MUST start with `--`. */
export const INVOKER_PREFIX = "--ck:";

/**
 * Default `commandfor` target id. Point every kernel `<button command>` at one
 * host element and bind a single delegated listener there.
 */
export const KERNEL_HOST_ID = "command-kernel-host";

/** The `command` attribute value for a path: `--ck:` + its deeplink. */
export function commandAttr(path: PathSegment[], opts?: DeeplinkOptions): string {
  return INVOKER_PREFIX + serializePath(path, opts);
}

/**
 * Decode a `command` attribute value back into a kernel path, or `null` when the
 * value is not one of ours (a built-in like `show-modal`, or another app's
 * custom command — leave those to the browser / other handlers).
 */
export function parseInvoker(command: string, opts?: DeeplinkOptions): PathSegment[] | null {
  if (!command.startsWith(INVOKER_PREFIX)) return null;
  return parseDeeplink(command.slice(INVOKER_PREFIX.length), opts);
}

/**
 * The shape of a `CommandEvent` we rely on. Declared locally because the TS DOM
 * lib does not yet ship `CommandEvent`; at runtime the real event has these (plus
 * more) per the Invoker Commands spec.
 */
interface CommandEventLike {
  /** the command string, e.g. `--ck:cmd/users.search` or a built-in `show-modal` */
  readonly command: string;
  /** the invoker `<button>` that fired it */
  readonly source: Element | null;
  preventDefault(): void;
}

/** What `bindInvokers` does with the kernel's response — one branch per kind. */
export interface InvokerHandlers {
  /** a successful run (the common case) */
  onResult?: (res: Extract<CommandResponse, { kind: "result" }>, source: Element | null) => void;
  /** the command is gated and not yet granted — route the human to approval */
  onGate?: (res: Extract<CommandResponse, { kind: "gate" }>, source: Element | null) => void;
  /** required args are missing / invalid — the markup under-specified the path */
  onArgs?: (res: Extract<CommandResponse, { kind: "args" }>, source: Element | null) => void;
  /** an entity arg matched many candidates — ask which one */
  onDisambiguate?: (
    res: Extract<CommandResponse, { kind: "disambiguate" }>,
    source: Element | null,
  ) => void;
  /**
   * The path addressed no executable command (a typo'd or since-renamed id) —
   * the kernel answered with completions instead of running anything. Without
   * this handler, stale markup would fail silently; surface it.
   */
  onUnresolved?: (
    res: Extract<CommandResponse, { kind: "completions" }>,
    source: Element | null,
  ) => void;
  /** the command's `run()` threw. Without this handler the error is re-thrown. */
  onError?: (error: unknown, path: PathSegment[], source: Element | null) => void;
}

/** Minimal host surface — anything that can add/remove a `command` listener. */
interface InvokerHost {
  addEventListener(type: "command", listener: (e: CommandEventLike) => void): void;
  removeEventListener(type: "command", listener: (e: CommandEventLike) => void): void;
}

export type BindInvokersOptions = DeeplinkOptions;

/**
 * Wire the native DOM invoker as a kernel driver.
 *
 * Attach one `command` listener to the `commandfor` target (`host`). Every fired
 * `--ck:` custom command is decoded, run through the shared kernel, and dispatched
 * to `handlers`. `getCtx` is read per-event so the driver always sees the live
 * role/location. Returns an unbind function.
 *
 *   const host = document.getElementById(KERNEL_HOST_ID)!;
 *   const off = bindInvokers(host, kernel, () => ctxRef.current, { onResult, onGate });
 *   // ...later: off();
 */
export function bindInvokers(
  host: InvokerHost,
  kernel: Kernel,
  getCtx: () => Ctx,
  handlers: InvokerHandlers = {},
  opts: BindInvokersOptions = {},
): () => void {
  const listener = (e: CommandEventLike): void => {
    const path = parseInvoker(e.command, opts);
    if (!path) return; // not ours — a built-in or another app's command
    e.preventDefault();
    const source = e.source;
    void kernel.command({ path, execute: true }, getCtx()).then(
      (res) => {
        switch (res.kind) {
          case "result":
            handlers.onResult?.(res, source);
            break;
          case "gate":
            handlers.onGate?.(res, source);
            break;
          case "args":
            handlers.onArgs?.(res, source);
            break;
          case "disambiguate":
            handlers.onDisambiguate?.(res, source);
            break;
          case "completions":
            handlers.onUnresolved?.(res, source);
            break;
          default:
            res satisfies never;
        }
      },
      (error: unknown) => {
        if (!handlers.onError) throw error; // surface it — never swallow silently
        handlers.onError(error, path, source);
      },
    );
  };
  host.addEventListener("command", listener);
  return () => host.removeEventListener("command", listener);
}
