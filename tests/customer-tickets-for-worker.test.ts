import { describe, expect, it } from "vitest";
import { customerTicketsForWorker, type CustomerTicket } from "@/lib/customer-tickets";

const base = { about: "Software training", status: "With the support team", updated: "2026-11-12T20:39:00.000Z" };

describe("the requests as the worker is shown them", () => {
  it("gives one number: the service desk key when there is one, and never Mike's own reference beside it", () => {
    const tickets: CustomerTicket[] = [{ ...base, reference: "TCK-1004", serviceDeskKey: "SDS-3", thisChat: true }];
    const [shown] = customerTicketsForWorker(tickets, new Map([["SDS-3", { status: "Waiting for support" }]]));
    expect(shown).toMatchObject({ number: "SDS-3", thisChat: true, serviceDesk: { status: "Waiting for support" } });
    expect(shown).not.toHaveProperty("reference");
    expect(shown).not.toHaveProperty("serviceDeskKey");
    expect(JSON.stringify(shown)).not.toContain("TCK-1004");
  });

  it("falls back to Mike's reference when no service desk ticket was raised", () => {
    const [shown] = customerTicketsForWorker([{ ...base, reference: "TCK-1138", serviceDeskKey: null }]);
    expect(shown).toMatchObject({ number: "TCK-1138", serviceDesk: null });
  });

  it("keeps the rest, such as whether a chase is allowed", () => {
    const [shown] = customerTicketsForWorker([{ ...base, reference: "TCK-7", serviceDeskKey: "SDS-9", chaseable: true }]);
    expect(shown).toMatchObject({ number: "SDS-9", chaseable: true, about: "Software training", status: "With the support team" });
  });
});
