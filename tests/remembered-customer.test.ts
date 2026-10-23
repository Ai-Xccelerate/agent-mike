import { describe, expect, it } from "vitest";
import { issueRememberToken, readRememberToken, REMEMBER_DAYS } from "@/lib/remembered-customer";

const customer = { email: "Pat@Example.com", name: "Pat Lee" };

describe("remembering a verified customer", () => {
  it("reads back who it was issued for, in the same organization", () => {
    const token = issueRememberToken("org-a", customer)!;
    expect(readRememberToken(token, "org-a")).toEqual({ email: "pat@example.com", name: "Pat Lee" });
  });

  it("is refused in another organization", () => {
    expect(readRememberToken(issueRememberToken("org-a", customer), "org-b")).toBeNull();
  });

  it("is refused once it has expired", () => {
    const issued = Date.now();
    const token = issueRememberToken("org-a", customer, issued)!;
    const later = issued + (REMEMBER_DAYS * 24 * 60 * 60 * 1000 + 1000);
    expect(readRememberToken(token, "org-a", later)).toBeNull();
  });

  it("is refused when anything in it was changed", () => {
    const token = issueRememberToken("org-a", customer)!;
    const [body, signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ o: "org-a", e: "boss@example.com", n: null, x: Date.now() + 1e9 })).toString("base64url");
    expect(readRememberToken(`${forged}.${signature}`, "org-a")).toBeNull();
    expect(readRememberToken(`${body}.${signature.slice(1)}x`, "org-a")).toBeNull();
    expect(readRememberToken("nonsense", "org-a")).toBeNull();
    expect(readRememberToken(undefined, "org-a")).toBeNull();
  });
});
