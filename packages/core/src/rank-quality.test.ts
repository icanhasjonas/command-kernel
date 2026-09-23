import { describe, expect, it } from "bun:test";
import { rank } from "./rank.js";
import type { CommandNode, Ctx } from "./types.js";

const ctx: Ctx = {
  location: { module: "mail" },
  user: { id: "u", name: "U", role: "admin", brand: "b" },
  now: 0,
  frecency: {},
};

const node = (id: string, title: string, keywords: string[] = []): CommandNode => ({
  id,
  title,
  keywords,
});

const ids = (query: string, nodes: CommandNode[]) => rank(nodes, query, ctx).map((r) => r.node.id);

// Found in a mail client's palette (gate-mail, 23 Sep): typing a person's name put commands
// first that matched only as letters scattered through their keywords.
describe("rank: what you typed, where you would look for it", () => {
  const mail = [
    node("new", "New mail", ["compose", "write", "send"]),
    node("copies", "Show Cc and Bcc", ["carbon copy", "blind"]),
    node("box", "Go to renewals", ["box", "renewals"]),
    node("marco", "Marco Ferri · Q4 price list sign-off", ["please confirm the Q4 list"]),
    node("mira", "Mira Okonkwo · Board pack, Thursday", ["jonas"]),
    node("bob", "Bob Tran · Re: Q3 renewal terms", ["renewals"]),
  ];

  it("a name typed finds the name first, not a command whose keywords spell it out", () => {
    expect(ids("marco", mail)[0]).toBe("marco");
    expect(ids("marco", mail)).not.toContain("new");
    expect(ids("bob", mail)).toEqual(["bob"]);
  });

  it("letters scattered far through a title are not a match", () => {
    expect(ids("marcoj", mail)).toEqual([]);
  });

  it("a word typed inside a keyword still finds the command, after title matches", () => {
    expect(ids("compose", mail)).toEqual(["new"]);
    const both = [node("title", "Blind copy settings"), node("kw", "Show Cc and Bcc", ["blind"])];
    expect(ids("blind", both)).toEqual(["title", "kw"]);
  });

  it("the start of a word in the title beats the same letters mid-word", () => {
    const n = [node("mid", "Unread count"), node("start", "Read the thread")];
    expect(ids("read", n)).toEqual(["start", "mid"]);
  });

  it("an abbreviation of the title's words still matches (fzf style)", () => {
    expect(ids("mu", [node("mu", "Mark unread")])).toEqual(["mu"]);
    expect(ids("rsd", [node("rd", "Resend draft")])).toEqual(["rd"]);
  });
});
