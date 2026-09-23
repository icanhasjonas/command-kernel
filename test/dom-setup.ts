/**
 * happy-dom global registration for `bun test`, shared by every React package (ui, react).
 *
 * The upstream `@happy-dom/global-registrator` package is not installed, so we
 * vendor the same logic here: build a happy-dom Window and mirror its property
 * descriptors onto `globalThis`, so React DOM + Testing Library have a document.
 *
 * IMPORTANT: `bun test` shares ONE process across every package's test files.
 * This module is imported ONLY by UI DOM tests and calls `unregister()` in
 * their `afterAll`, so the DOM globals never leak into core / boundary tests.
 *
 * Because ESM evaluates imports in source order, a test file that does
 *   import { registerDom } from "../../../test/dom-setup.js";
 * BEFORE importing "@testing-library/react" guarantees the document exists by
 * the time RTL's module code runs.
 */
import { Window } from "happy-dom";

// keys that must never be copied onto globalThis (would break the runtime)
const IGNORE = new Set(["undefined", "NaN", "Infinity", "global", "globalThis"]);
// keys that should point back at globalThis, not at the happy-dom window
const SELF_REFERRING = new Set(["self", "top", "parent", "window"]);
// happy-dom's Window re-exposes every JS built-in (Object, Array, fetch, URL…)
// as an own property. We keep the native runtime's versions for anything that
// already exists - EXCEPT these event types, where happy-dom MUST win so that a
// `new Event()` from Testing Library is an instance the happy-dom document
// accepts on dispatch.
const DOM_OVERRIDE = new Set([
  "Event",
  "CustomEvent",
  "EventTarget",
  "KeyboardEvent",
  "MouseEvent",
  "PointerEvent",
  "InputEvent",
  "FocusEvent",
  "UIEvent",
]);

type Saved = Record<string, PropertyDescriptor | null>;
let saved: Saved | null = null;

export function registerDom(): void {
  if (saved !== null) return; // idempotent - one DOM per process is plenty
  const win = new Window({ url: "https://localhost/" });
  saved = {};

  const winDescriptors = Object.getOwnPropertyDescriptors(win);
  const globalDescriptors = Object.getOwnPropertyDescriptors(globalThis);

  for (const key of Object.keys(winDescriptors)) {
    if (IGNORE.has(key)) continue;
    const existing = globalDescriptors[key];
    if (existing) {
      // don't clobber a native runtime global (Object, Array, fetch, URL, …)
      // unless it's a DOM event type happy-dom must own for dispatch to match
      if (!existing.configurable || !DOM_OVERRIDE.has(key)) continue;
    }

    const descriptor = winDescriptors[key];
    if (!descriptor) continue;
    saved[key] = existing ?? null;

    try {
      if (SELF_REFERRING.has(key)) {
        Object.defineProperty(globalThis, key, { ...descriptor, value: globalThis });
        continue;
      }
      const value = descriptor.value;
      // bind host FUNCTIONS (setTimeout, requestAnimationFrame, getComputedStyle)
      // to globalThis; never bind a class constructor (would drop its statics)
      const isPlainFn =
        typeof value === "function" &&
        !Function.prototype.toString.call(value).startsWith("class ");
      Object.defineProperty(globalThis, key, {
        ...descriptor,
        ...(isPlainFn ? { value: value.bind(globalThis) } : {}),
      });
    } catch {
      // some host globals are locked down - best effort, skip them
      delete saved[key];
    }
  }
}

export function unregisterDom(): void {
  if (saved === null) return;
  for (const [key, descriptor] of Object.entries(saved)) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete (globalThis as Record<string, unknown>)[key];
  }
  saved = null;
}

// Register as an import side effect so `import "./dom-setup"` at the very top of
// a test file installs the DOM before any Testing Library module evaluates.
registerDom();
