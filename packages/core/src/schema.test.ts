import { describe, expect, it } from "bun:test";
import { toJsonSchema, validateArgs } from "./schema.js";
import type { CommandNode } from "./types.js";

const sendEmail: CommandNode = {
  id: "email.send",
  title: "Send email",
  args: [
    { id: "to", label: "recipient", kind: "email", required: true },
    {
      id: "template",
      label: "template",
      kind: "enum",
      enumValues: [
        { value: "welcome", label: "Welcome" },
        { value: "reset", label: "Reset" },
      ],
    },
    { id: "note", label: "note", kind: "text" },
  ],
};

describe("toJsonSchema - the keystone, MCP-shaped", () => {
  it("derives a flat object schema with required + formats + enums", () => {
    expect(toJsonSchema(sendEmail)).toEqual({
      type: "object",
      additionalProperties: false,
      required: ["to"],
      properties: {
        // only `to` carries a description: its label ("recipient") differs from its id
        to: { type: "string", description: "recipient", format: "email" },
        template: { type: "string", enum: ["welcome", "reset"] },
        note: { type: "string" },
      },
    });
  });

  it("a node with no args yields an empty object schema", () => {
    expect(toJsonSchema({ id: "x", title: "X" })).toEqual({
      type: "object",
      additionalProperties: false,
      required: [],
      properties: {},
    });
  });
});

describe("validateArgs - the kernel checks what a driver sends", () => {
  it("passes valid values", () => {
    expect(validateArgs(sendEmail, { to: "a@b.io", template: "welcome" })).toEqual([]);
  });

  it("rejects a malformed email", () => {
    const errs = validateArgs(sendEmail, { to: "not-an-email" });
    expect(errs.map((e) => e.argId)).toEqual(["to"]);
  });

  it("rejects an out-of-enum value", () => {
    const errs = validateArgs(sendEmail, { to: "a@b.io", template: "nope" });
    expect(errs.map((e) => e.argId)).toEqual(["template"]);
  });

  it("does NOT report empty values (that is missingArgs's job)", () => {
    expect(validateArgs(sendEmail, {})).toEqual([]);
  });

  it("runs a node's custom validate", () => {
    const node: CommandNode = {
      id: "set.port",
      title: "Set port",
      args: [
        {
          id: "port",
          label: "port",
          kind: "string",
          validate: (v) => (/^\d+$/.test(v) ? null : "must be numeric"),
        },
      ],
    };
    expect(validateArgs(node, { port: "abc" })[0]?.message).toBe("must be numeric");
    expect(validateArgs(node, { port: "8080" })).toEqual([]);
  });

  // gate-mail, 23 Sep: a list declared with maxItems 50 took 500 entries. The schema was
  // published (toJsonSchema spreads it) but never enforced.
  it("enforces a list's minItems and maxItems", () => {
    const node: CommandNode = {
      id: "mail.send",
      title: "Send",
      args: [
        {
          id: "to",
          label: "to",
          kind: "json",
          schema: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 2 },
        },
      ],
    };
    expect(validateArgs(node, { to: ["a@b.io", "c@d.io"] })).toEqual([]);
    expect(validateArgs(node, { to: ["a", "b", "c"] })[0]?.message).toContain("at most 2");
    expect(validateArgs(node, { to: [] })[0]?.message).toContain("at least 1");
  });

  it("enforces a text's maxLength inside a json schema", () => {
    const node: CommandNode = {
      id: "x",
      title: "X",
      args: [
        {
          id: "keys",
          label: "keys",
          kind: "json",
          schema: { type: "array", items: { type: "string", maxLength: 3 } },
        },
      ],
    };
    expect(validateArgs(node, { keys: ["abc"] })).toEqual([]);
    expect(validateArgs(node, { keys: ["abcd"] })[0]?.message).toContain("at most 3");
  });
});
