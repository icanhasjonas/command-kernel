import { defineCommand, defineEvent } from "@command-kernel/wire";

/**
 * The lab's wire declarations, imported by BOTH halves: the Worker implements them,
 * the page calls them. No `run` in here, so nothing server-side ships to the browser.
 * The page's own kernel never sees these; they live on the server's.
 */

export const LAB_ROLES = ["viewer", "advisor", "admin"] as const;
export type LabRole = (typeof LAB_ROLES)[number];

export const FLAGS = ["maintenance", "beta-banner"] as const;
export type Flag = (typeof FLAGS)[number];

export const KEYS = ["signing", "public"] as const;
export type KeyName = (typeof KEYS)[number];

/** What the server answers about itself: every field read on the server, at call time. */
export interface LabStatus {
  /** the Cloudflare data centre that answered, e.g. "AMS" */
  colo: string;
  online: number;
  served: number;
  flags: Record<Flag, boolean>;
  /** a short fingerprint per key; a rotation changes it for everyone */
  keys: Record<KeyName, string>;
  /** who the server thinks you are, from the ctx IT built */
  you: { visitor: string; role: LabRole };
}

export const labStatus = defineCommand<Record<string, never>, LabStatus>()(
  {
    id: "lab.status",
    title: "Server status",
    summary: "What the server knows right now, including who it thinks you are",
    effect: "pure",
  },
  { http: { method: "GET", path: "/status" }, returns: "the server's state and your ctx" },
);

export const flipFlag = defineCommand<{ flag: Flag }, { flag: Flag; on: boolean }>()(
  {
    id: "lab.flag",
    title: "Flip a flag",
    summary: "Turn a shared flag on or off for every visitor",
    effect: "writes",
    args: [
      {
        id: "flag",
        label: "flag",
        kind: "enum",
        required: true,
        enumValues: FLAGS.map((f) => ({ value: f, label: f })),
      },
    ],
    gate: { roles: ["advisor"] },
  },
  { returns: "the flag and its new state" },
);

export const rotateKey = defineCommand<{ key: KeyName }, { key: KeyName; fingerprint: string }>()(
  {
    id: "lab.rotate",
    title: "Rotate a key",
    summary: "Replace a key; every client holding the old one stops working",
    effect: "writes",
    args: [
      {
        id: "key",
        label: "key",
        kind: "enum",
        required: true,
        enumValues: KEYS.map((k) => ({ value: k, label: k })),
      },
    ],
    gate: { roles: ["admin"], confirm: true, reason: "Every client using the old key breaks" },
  },
  { returns: "the key and its new fingerprint" },
);

export const LAB_SPECS = [labStatus, flipFlag, rotateKey] as const;

/** Something changed on the server; sent to every connected visitor. Never carries free text. */
export interface LabChange {
  command: string;
  /** what changed, from enum values only: "maintenance on", "signing" */
  what: string;
  /** the role and a short tag of the visitor who did it */
  by: { role: LabRole; tag: string };
  flags: Record<Flag, boolean>;
  keys: Record<KeyName, string>;
}

export const labChanged = defineEvent<LabChange>("lab.changed", "A visitor changed the lab");
export const presence = defineEvent<{ online: number }>("lab.presence", "Who is connected");

/** How a visitor says who they are (demo only: a real host reads this from a sign-in). */
export const VISITOR_HEADER = "x-lab-visitor";
export const ROLE_HEADER = "x-lab-role";
export const VISITOR_RE = /^[a-z0-9]{8,32}$/;

export const isLabRole = (v: unknown): v is LabRole =>
  typeof v === "string" && (LAB_ROLES as readonly string[]).includes(v);
