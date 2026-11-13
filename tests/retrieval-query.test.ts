import { describe, expect, it } from "vitest";
import { retrievalQueryFor, searchQueryFor } from "@/lib/retrieval-query";

const customer = (body: string) => ({ senderType: "customer", body });
const agent = (body: string) => ({ senderType: "agent", body });
const manager = (body: string) => ({ senderType: "manager", body });

describe("what is searched for a customer's message", () => {
  it("is the message itself when it says enough and answers no question", () => {
    expect(retrievalQueryFor([customer("How do I reset my password for the EAP portal?")])).toBe("How do I reset my password for the EAP portal?");
  });

  it("adds the earlier question when the worker had just asked one, even if the answer is long", () => {
    const query = retrievalQueryFor([
      customer("How do i arrange training for new staff members"),
      agent("Do you mean training events for client companies, or training your own staff to use EAP Expert?"),
      customer("I mean training my own staff on how to use the EAP Expert software"),
    ]);
    expect(query).toContain("arrange training for new staff members");
    expect(query).toContain("my own staff");
  });

  it("adds the earlier message to a short follow-up", () => {
    expect(retrievalQueryFor([customer("How do I register members for the Self-Scheduler?"), agent("Share the link."), customer("that didn't work")])).toContain("Self-Scheduler");
  });

  it("never returns an empty search: the message itself is the fallback", () => {
    expect(searchQueryFor("widget", [], customer("How do I add a provider?"))).toBe("How do I add a provider?");
    expect(searchQueryFor("widget", [], manager("How do I add a provider?"))).toBe("How do I add a provider?");
  });

  it("in the Playground the tester's lines (stored as a manager) count as the customer's", () => {
    const query = searchQueryFor(
      "chat",
      [manager("How do i arrange training for new staff members"), agent("Do you mean A or B?")],
      manager("I mean training my own staff"),
    );
    expect(query).toContain("arrange training");
  });

  it("in a real conversation a manager's reply is not the customer's", () => {
    const query = searchQueryFor("widget", [customer("Printer is offline in the lab"), manager("INTERNAL: escalate this one please?")], customer("still the same problem here today"));
    expect(query).not.toContain("INTERNAL");
  });
});
