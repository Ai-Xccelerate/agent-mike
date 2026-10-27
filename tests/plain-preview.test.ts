import { describe, expect, it } from "vitest";
import { plainPreview } from "../frontend/src/lib/plain-preview";

describe("the one-line preview of a Markdown message", () => {
  it("drops numbering, bold and heading marks, as in the Inbox rows", () => {
    expect(plainPreview("1. Open the **Client Files** module.\n2. Use the search fields.")).toBe("Open the Client Files module. · Use the search fields.");
    expect(plainPreview("### Reset a password\n1. Go to **Staff/Security Module**.")).toBe("Reset a password · Go to Staff/Security Module.");
  });

  it("keeps the words of links, code and quotes, and leaves plain text alone", () => {
    expect(plainPreview("See [the guide](https://example.com/g) and run `Save` now.\n> note")).toBe("See the guide and run Save now. · note");
    expect(plainPreview("You're welcome! Glad I could help.")).toBe("You're welcome! Glad I could help.");
    expect(plainPreview("It cost 3 * 4 = 12 and snake_case stays.")).toBe("It cost 3 * 4 = 12 and snake_case stays.");
  });

  it("copes with empty text and fenced code", () => {
    expect(plainPreview("")).toBe("");
    expect(plainPreview("Run this:\n```\nrm -rf x\n```\nDone.")).toBe("Run this: · Done.");
  });
});
