import {
  animate,
  type MotionValue,
  useMotionValue,
  useReducedMotion,
  type ValueAnimationTransition,
} from "motion/react";
import { type RefObject, useEffect, useLayoutEffect, useRef } from "react";
import { motionTokens } from "./motion-tokens.js";

/** What moved the selection last: the pointer gets a spring, a key a short slide. */
function usePointerLast(): RefObject<boolean> {
  const pointer = useRef(false);
  useEffect(() => {
    const onPointer = () => {
      pointer.current = true;
    };
    const onKey = () => {
      pointer.current = false;
    };
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("keydown", onKey, true);
    };
  }, []);
  return pointer;
}

export interface Glide {
  y: MotionValue<number>;
  height: MotionValue<number>;
  opacity: MotionValue<number>;
}

/**
 * Arc's one highlight that follows the active row of a list: it fades in where it first lands,
 * then glides (a spring for the pointer, a 70 ms slide for the arrow keys), and fades out when
 * nothing is active. Reduced motion: it jumps. `layoutKey` changes whenever the rows do, so the
 * highlight re-measures when a new list puts a different row under the same index.
 */
export function useGlide(
  listRef: RefObject<HTMLElement | null>,
  activeId: string | null,
  layoutKey: string,
): Glide {
  const reduce = useReducedMotion();
  const pointer = usePointerLast();
  const shown = useRef(false);
  const y = useMotionValue(0);
  const height = useMotionValue(0);
  const opacity = useMotionValue(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: layoutKey stands for the rows
  useLayoutEffect(() => {
    const list = listRef.current;
    const node = activeId && list ? list.ownerDocument.getElementById(activeId) : null;
    if (!list || !node) {
      shown.current = false;
      animate(opacity, 0, { duration: reduce ? 0 : 0.1 });
      return;
    }
    const move: ValueAnimationTransition<number> =
      !shown.current || reduce
        ? { duration: 0 }
        : pointer.current
          ? motionTokens.spring.snappy
          : { duration: 0.07, ease: [...motionTokens.ease.enter] };
    // rows may sit inside groups: sum the offsets up to the list
    let top = 0;
    for (
      let el: HTMLElement | null = node;
      el && el !== list;
      el = el.offsetParent as HTMLElement | null
    ) {
      top += el.offsetTop + (el === node ? 0 : el.clientTop);
    }
    animate(y, top, move);
    animate(height, node.offsetHeight, move);
    animate(opacity, 1, { duration: reduce ? 0 : 0.08 });
    shown.current = true;
    if (!pointer.current) node.scrollIntoView?.({ block: "nearest" });
  }, [activeId, layoutKey, reduce, listRef, y, height, opacity, pointer]);

  return { y, height, opacity };
}
