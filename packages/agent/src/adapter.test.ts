import { describe, expect, it } from "bun:test";
import type { CommandNode } from "@command-kernel/core";
import { pickTool } from "./adapter";

const tools: CommandNode[] = [
  {
    id: "subs.resync",
    title: "Re-sync submission to CRM",
    keywords: ["resync", "crm"],
    args: [{ id: "submissionId", label: "submission", kind: "string", required: true }],
  },
  { id: "go.subs", title: "Go to Submissions" },
  {
    id: "email.send",
    title: "Send email",
    args: [
      { id: "to", label: "to", kind: "entity", entity: { type: "person" }, required: true },
      { id: "body", label: "body", kind: "text" },
      { id: "files", label: "files", kind: "entity", entity: { type: "file" }, multiple: true },
    ],
  },
];

describe("pickTool, the toy picker", () => {
  it("matches whole words: 'submissions' is not 'submission'", () => {
    expect(pickTool("go to submissions", tools)?.node.id).toBe("go.subs");
    expect(pickTool("resync submission sub_1 to the crm", tools)?.node.id).toBe("subs.resync");
  });

  it("puts an address in one person arg, never in a list", () => {
    const pick = pickTool("email jo@example.com hello", tools);
    expect(pick?.values).toEqual({ to: "jo@example.com", body: "email jo@example.com hello" });
  });

  it("answers null when no word of the goal names a tool", () => {
    expect(pickTool("make coffee", tools)).toBeNull();
  });
});
