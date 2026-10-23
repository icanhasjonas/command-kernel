import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type KeyboardEvent, type ReactNode, useRef } from "react";
import { enter, instant, leave, motionTokens } from "./motion-tokens.js";

/**
 * The palette's modal layer, moving as Arc's dialog does: the overlay fades, the panel rises
 * 8px and settles on a damped spring, and leaves shorter and quieter than it came. Reduced
 * motion: a fade only. It also puts focus back where it was when it opened (Radix does that
 * only for a Dialog.Trigger, and the palette opens from a key).
 */
export function PaletteDialog({
  open,
  onClose,
  onKeyDown,
  onCloseAutoFocus,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onKeyDown: (e: KeyboardEvent) => void;
  onCloseAutoFocus?: ((event: Event) => void) | undefined;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  // the element that had focus when the palette opened: it gets it back on close
  const returnTo = useRef<HTMLElement | null>(null);
  // the exiting palette is the last render with open=true: read the host's handler from now
  const closeFocus = useRef(onCloseAutoFocus);
  closeFocus.current = onCloseAutoFocus;

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: reduce ? instant : leave }}
                transition={reduce ? instant : enter}
                className="fixed inset-0 z-50 bg-ck-overlay backdrop-blur-[7px]"
              />
            </Dialog.Overlay>
            <Dialog.Content
              onEscapeKeyDown={(e) => e.preventDefault()}
              onKeyDown={onKeyDown}
              onOpenAutoFocus={() => {
                const was = document.activeElement;
                returnTo.current = was instanceof HTMLElement && was !== document.body ? was : null;
              }}
              onCloseAutoFocus={(e) => {
                closeFocus.current?.(e);
                if (e.defaultPrevented) return;
                e.preventDefault();
                const was = returnTo.current;
                returnTo.current = null;
                if (was?.isConnected) was.focus({ preventScroll: true });
              }}
              aria-describedby={undefined}
              asChild
            >
              <motion.div
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={
                  reduce
                    ? { opacity: 0, transition: instant }
                    : { opacity: 0, y: 4, scale: 0.98, transition: leave }
                }
                transition={
                  reduce
                    ? instant
                    : {
                        default: motionTokens.spring.smooth,
                        opacity: { ...enter, duration: motionTokens.duration.fast },
                      }
                }
                style={{ transformOrigin: "top center" }}
                className="-translate-x-1/2 fixed top-[14vh] left-1/2 z-50 w-[min(640px,92vw)] overflow-hidden rounded-ck-panel border border-ck-border bg-ck-surface text-ck-fg shadow-ck-float outline-none"
              >
                <Dialog.Title className="sr-only">Command palette</Dialog.Title>
                {children}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
