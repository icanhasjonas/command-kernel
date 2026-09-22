import type { ArgValues } from "@command-kernel/core";

/** A JSON object (not null, not a list): the shape of an arg bag, a frame, an envelope. */
export const isBag = (v: unknown): v is ArgValues =>
  typeof v === "object" && v !== null && !Array.isArray(v);
