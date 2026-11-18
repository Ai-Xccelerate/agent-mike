import { describe, expect, it } from "vitest";
import { earlierQueryFor, earlierSearchQueryFor, retrievalQueryFor, searchQueryFor, withoutNegatedWords } from "@/lib/retrieval-query";

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

describe("what a negation does to the search", () => {
  it("leaves out the negator and the word it negates, so 'no error' does not search for errors", () => {
    expect(withoutNegatedWords("No error, connection fails")).toBe(", connection fails");
    expect(withoutNegatedWords("it is not working")).toBe("it is");
    expect(withoutNegatedWords("I connect without VPN")).toBe("I connect");
    expect(withoutNegatedWords("I can't log in to Parallels")).toBe("I can't log in to Parallels");
  });

  it("never returns an empty search", () => {
    expect(withoutNegatedWords("not working")).toBe("not working");
  });

  it("is applied to what is searched: the follow-up 'No error, connection fails' no longer searches for 'error'", () => {
    const query = retrievalQueryFor([customer("I can't log in to Parallels"), agent("Does it show an error message, or does the connection fail without one?"), customer("No error, connection fails")]);
    expect(query).toContain("log in to Parallels");
    expect(query).toContain("connection fails");
    expect(query.toLowerCase()).not.toContain("error");
  });
});

describe("the earlier messages searched on their own", () => {
  it("is what the customer first asked, when the latest message only answers or follows up", () => {
    const transcript = [customer("I can't log in to Parallels"), agent("Does it show an error message?"), customer("No error, connection fails")];
    expect(earlierQueryFor(transcript)).toBe("I can't log in to Parallels");
    expect(earlierSearchQueryFor("widget", transcript.slice(0, 2), customer("No error, connection fails"))).toBe("I can't log in to Parallels");
  });

  it("is null for a message that stands on its own, or when there is nothing earlier", () => {
    expect(earlierQueryFor([customer("How do I register members for the Self-Scheduler on our public site?")])).toBeNull();
    expect(earlierQueryFor([customer("thanks")])).toBeNull();
    expect(earlierQueryFor([customer("How do I set up a new connection for a remote user at our clinic, step by step?"), agent("Done."), customer("How do I reset a password for one of our staff members who is locked out?")])).toBeNull();
  });
});
