/**
 * The bridge, exercised over a REAL MCP stdio hop: spawn `src/index.ts` as a
 * child process, talk to it with the SDK's own Client, and assert the three
 * properties that matter -- the projection's tools are advertised, a pure
 * command runs, and the GATED command comes back gated (never executed).
 *
 * No network, sub-second. This is the CI proof of the README's "~50 lines" claim.
 */
import { afterAll, beforeAll, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const serverPath = new URL("./index.ts", import.meta.url).pathname;

const client = new Client({ name: "bridge-test", version: "0.1.0" });
const transport = new StdioClientTransport({ command: "bun", args: [serverPath] });

beforeAll(async () => {
  await client.connect(transport);
});
afterAll(async () => {
  await client.close();
});

/** Pull the JSON payload the bridge stuffs into the tool result's text content. */
function payload(res: unknown): Record<string, unknown> {
  const content = (res as { content?: Array<{ type: string; text: string }> }).content;
  const first = content?.[0];
  if (first?.type !== "text") throw new Error("no text content");
  return JSON.parse(first.text) as Record<string, unknown>;
}

test("tools/list advertises the projection's generic tools", async () => {
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name);
  expect(names).toEqual(expect.arrayContaining(["search", "resolve", "execute", "discover"]));
});

test("tools/call on a pure command executes and returns its result", async () => {
  const res = await client.callTool({ name: "execute", arguments: { path: "health.ping" } });
  const out = payload(res);
  expect(out.kind).toBe("result");
  expect(String(out.message)).toContain("pong");
});

test("tools/call on search returns completions", async () => {
  const res = await client.callTool({ name: "search", arguments: { query: "issues" } });
  const out = payload(res);
  expect(out.kind).toBe("completions");
});

test("tools/call on the GATED command comes back gated, NOT executed", async () => {
  const res = await client.callTool({
    name: "execute",
    arguments: { path: "issues.close", args: { issueId: "ISS-14" } },
  });
  const out = payload(res);
  // the trust line: a human must approve out of band; the model cannot self-approve
  expect(out.kind).toBe("gate");
  // and it did NOT run: no "Closed ..." result leaked through
  expect(JSON.stringify(out)).not.toContain("Closed");
});
