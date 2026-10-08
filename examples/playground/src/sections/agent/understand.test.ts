import { describe, expect, it } from "bun:test";
import { kernel } from "../../demo/kernel";
import { sendEmail } from "../../providers/misc";
import { usersCategory } from "../../providers/users";
import { fillFromNames, verbItCannotDo } from "./understand";

const ctx = {
  location: { module: "home" },
  user: { id: "u", name: "T", role: "admin", brand: "c" },
  now: 0,
  frecency: {},
};

describe("the demo agent's two honesty rules", () => {
  it("will not answer 'delete all users' with a tool that only goes to Users", () => {
    expect(verbItCannotDo("delete all users", usersCategory)).toBe("delete");
    expect(verbItCannotDo("go to users", usersCategory)).toBeNull();
  });

  it("fills the person a goal names, and the text after 'about'", async () => {
    const values = await fillFromNames(
      "email ada about the launch",
      sendEmail,
      { body: "email ada about the launch" },
      kernel.entities,
      ctx,
    );
    expect(values.to).toBe("ada@analytical.engine");
    expect(values.body).toBe("the launch");
  });

  it("an ambiguous name fills nothing: asking beats guessing", async () => {
    // "jon" names Jon Snow, Jonas Frost and Joni Mitchell
    const values = await fillFromNames("email jon", sendEmail, {}, kernel.entities, ctx);
    expect(values.to).toBeUndefined();
  });
});
