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
    expect(pick?.values).toEqual({ to: "jo@example.com", body: "hello" });
  });

  it("fills a text arg with what the goal says, not the whole request", () => {
    const pick = pickTool("send an email to jo@example.com about the launch date", tools);
    expect(pick?.values.body).toBe("the launch date");
    expect(pickTool("email jo@example.com a welcome note", tools)?.values.body).toBe(
      "welcome note",
    );
    const seal = pickTool("encrypt the launch date for ada@analytical.engine", [
      {
        id: "crypto.encrypt",
        title: "Encrypt for…",
        args: [
          { id: "text", label: "text", kind: "text", required: true },
          { id: "to", label: "to", kind: "entity", entity: { type: "person" }, required: true },
        ],
      },
    ]);
    expect(seal?.values).toEqual({ text: "the launch date", to: "ada@analytical.engine" });
  });

  it("leaves a text arg empty when the goal says nothing beyond the tool", () => {
    expect(pickTool("send email to jo@example.com", tools)?.values.body).toBeUndefined();
  });

  it("answers null when no word of the goal names a tool", () => {
    expect(pickTool("make coffee", tools)).toBeNull();
  });
});
