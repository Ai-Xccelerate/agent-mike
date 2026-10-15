import { describe, expect, it } from "vitest";
import { extractStatedCustomer } from "@/lib/customer-stated";

describe("extractStatedCustomer", () => {
  it("reads the name, email and company the customer typed on one line", () => {
    expect(extractStatedCustomer(["Dana Reyes, dana@riverside-counseling.example, Riverside Counseling."])).toEqual({
      name: "Dana Reyes",
      email: "dana@riverside-counseling.example",
    });
  });

  it("reads an introduction and an email from different messages, oldest first", () => {
    expect(extractStatedCustomer(["Hi, my name is Priya Nair and the login is broken", "reach me at Priya.Nair@Acme.com"])).toEqual({
      name: "Priya Nair",
      email: "priya.nair@acme.com",
    });
  });

  it("understands 'name:' and 'this is'", () => {
    expect(extractStatedCustomer(["name: Sam Ortiz\nemail: sam@example.com"])).toEqual({ name: "Sam Ortiz", email: "sam@example.com" });
    expect(extractStatedCustomer(["this is Lee Chen from Acme, my email is lee@acme.io"])).toEqual({ name: "Lee Chen", email: "lee@acme.io" });
  });

  it("returns just the email when no name is given, and just the name when no email is", () => {
    expect(extractStatedCustomer(["you can email me at ops@example.org"])).toEqual({ name: null, email: "ops@example.org" });
    expect(extractStatedCustomer(["my name is Jordan"])).toEqual({ name: "Jordan", email: null });
  });

  it("does not mistake ordinary sentences for a name", () => {
    expect(extractStatedCustomer(["this is Urgent", "I am Unable to log in", "Nobody in our office can log in"])).toBeNull();
    expect(extractStatedCustomer(["Hello Team, ops@example.org"])).toEqual({ name: null, email: "ops@example.org" });
    expect(extractStatedCustomer([])).toBeNull();
  });

  it("takes the first email and the first name only", () => {
    expect(extractStatedCustomer(["Ana Ruiz, ana@a.com", "my name is Bob Stone, bob@b.com"])).toEqual({ name: "Ana Ruiz", email: "ana@a.com" });
  });

  it("does not run away on long text or odd input", () => {
    const long = "word ".repeat(20000) + "my name is Dana Reyes";
    expect(extractStatedCustomer([long])?.name).toBe("Dana Reyes");
    expect(extractStatedCustomer(["@@@ a@ @b .com ,,,"])).toBeNull();
  });
});
