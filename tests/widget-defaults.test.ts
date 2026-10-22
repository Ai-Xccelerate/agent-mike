import { describe, expect, it } from "vitest";
import { defaultQuickActions, NO_HELPDESK } from "@/lib/widget-defaults";

describe("the widget's built-in quick actions", () => {
  it("offer only a question when there is no helpdesk, so no button promises what the worker can't do", () => {
    expect(defaultQuickActions(NO_HELPDESK)).toEqual(["Ask a question"]);
  });

  it("add ticket buttons for a worker that raises and reads tickets", () => {
    expect(defaultQuickActions({ raisesTickets: true, looksUpTickets: true })).toEqual([
      "Report a problem",
      "Ask a question",
      "Check my ticket",
      "Request a feature",
    ]);
  });

  it("don't offer to check a ticket the worker can't read, or to report one it can't raise", () => {
    expect(defaultQuickActions({ raisesTickets: true, looksUpTickets: false })).toEqual(["Report a problem", "Ask a question", "Request a feature"]);
    expect(defaultQuickActions({ raisesTickets: false, looksUpTickets: true })).toEqual(["Ask a question", "Check my ticket"]);
  });
});
