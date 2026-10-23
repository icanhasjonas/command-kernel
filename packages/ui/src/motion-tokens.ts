import type { Transition } from "motion/react";

/**
 * Arc's motion presets (uiarc.dev/r/arc-motion-tokens.json), the values the palette moves
 * with. Copied, not imported: the package depends on no host design system.
 */
export const motionTokens = {
  duration: { instant: 0.12, fast: 0.16, exit: 0.18, standard: 0.24, considered: 0.48 },
  ease: {
    enter: [0.16, 1, 0.3, 1],
    exit: [0.7, 0, 0.84, 0],
    standard: [0.22, 1, 0.36, 1],
  },
  spring: {
    /** presses and small indicators: settles fast, never overshoots */
    snappy: { type: "spring", visualDuration: 0.26, bounce: 0 },
    /** panels, height changes and layout shifts: critically damped */
    smooth: { type: "spring", visualDuration: 0.4, bounce: 0 },
    /** width that follows new content (a pill gaining a value) */
    morph: { type: "spring", visualDuration: 0.42, bounce: 0 },
  },
} as const satisfies {
  duration: Record<string, number>;
  ease: Record<string, readonly [number, number, number, number]>;
  spring: Record<string, Transition>;
};

const bezier = (e: readonly [number, number, number, number]): [number, number, number, number] => [
  ...e,
];

/** Entrances: a standard tween on the enter curve. */
export const enter: Transition = {
  duration: motionTokens.duration.standard,
  ease: bezier(motionTokens.ease.enter),
};

/** Exits are shorter and quieter than entrances. */
export const leave: Transition = {
  duration: motionTokens.duration.fast,
  ease: bezier(motionTokens.ease.standard),
};

/** The reduced-motion branch of every animation: the end state, at once. */
export const instant: Transition = { duration: 0 };
