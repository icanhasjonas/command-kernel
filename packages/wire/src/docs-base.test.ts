import { describe, expect, it } from "bun:test";
import { renderCommandDocs } from "./docs.js";
import { boxChanged, specs } from "./fixtures.test-util.js";

/** A host's generated reference shows the paths it really serves, under its own base. */

describe("renderCommandDocs with a base", () => {
  it("POST and GET paths are under the base", () => {
    const md = renderCommandDocs("Mail API", specs, [boxChanged], { base: "/api/v1" });
    expect(md).toContain("`POST /api/v1/thread.list`");
    expect(md).toContain("`GET /api/v1/boxes/:boxId/messages/:messageId` (cacheable forever)");
    expect(md).not.toContain("<base>");
  });

  it("a trailing slash on the base is ignored, and the output stays deterministic", () => {
    const a = renderCommandDocs("Mail API", specs, [], { base: "/api/v1/" });
    const b = renderCommandDocs("Mail API", [...specs].reverse(), [], { base: "/api/v1" });
    expect(a).toBe(b);
    expect(a).toContain("`POST /api/v1/thread.setSeen`");
  });

  it("without a base the placeholder stays, as before", () => {
    expect(renderCommandDocs("x", specs)).toContain("`POST /<base>/thread.list`");
  });
});
