/**
 * Run an observer hook after the fact. The command already ran, so a hook that throws
 * (or an async one that rejects) must not turn its result into a failure: that would
 * tell the caller a write that happened did not, and invite a retry. Swallowed.
 */
export function observe(hook: () => unknown): void {
  try {
    const out = hook();
    if (out instanceof Promise) out.catch(() => {});
  } catch {
    // the observer failed; the command's result stands
  }
}
