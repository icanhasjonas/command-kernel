/**
 * The HTML Invoker Commands API (`command` / `commandfor`) is Baseline 2026 in
 * the browser, but `@types/react` doesn't type the attributes yet. Teach the JSX
 * button element about them so `<button command="--ck:..." commandfor="...">`
 * typechecks without a cast.
 *
 * A regular .ts module (not a .d.ts) so tsc EMITS it to dist and the published
 * package carries the augmentation; index.ts imports it for the side effect.
 */
import "react";

declare module "react" {
  interface ButtonHTMLAttributes<T> {
    /** native invoker: a built-in (`show-modal`) or a custom `--`-prefixed command */
    command?: string;
    /** native invoker: id of the element this button controls */
    commandfor?: string;
  }
}
