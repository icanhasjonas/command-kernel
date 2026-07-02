import { describe, expect, it } from "bun:test";
import type { CommandNode, Ctx } from "@command-kernel/core";
import { collectTools, toMcpTool } from "./tools.js";

const ctx = (role: string): Ctx => ({
  location: { module: "home" },
  user: { id: "u1", name: "T", role, brand: "circle" },
  now: 0,
  frecency: {},
});

const send: CommandNode = {
  id: "email.send",
  title: "Send email",
  summary: "Send an email to a user",
  args: [{ id: "to", label: "to", kind: "email", required: true }],
  run: async () => ({ kind: "toast", message: "sent" }),
};
const category: CommandNode = { id: "users", title: "Users", resolve: async () => [] };
const adminTool: CommandNode = {
  id: "danger",
  title: "Danger",
  when: (c) => c.user.role === "admin",
  run: async () => ({ kind: "toast", message: "x" }),
};

describe("toMcpTool — MCP-shaped tool definition", () => {
  it("maps a node to { name, description, inputSchema }", () => {
    expect(toMcpTool(send)).toEqual({
      name: "email.send",
      description: "Send an email to a user",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["to"],
        // no description: the arg's label equals its id, so it adds nothing
        properties: { to: { type: "string", format: "email" } },
      },
    });
  });
});

describe("collectTools", () => {
  it("includes only executable nodes (skips pure categories)", () => {
    expect(collectTools([send, category]).map((t) => t.name)).toEqual(["email.send"]);
  });

  it("respects when(ctx)", () => {
    expect(collectTools([send, adminTool], ctx("admin")).map((t) => t.name)).toEqual([
      "email.send",
      "danger",
    ]);
    expect(collectTools([send, adminTool], ctx("viewer")).map((t) => t.name)).toEqual([
      "email.send",
    ]);
  });
});
