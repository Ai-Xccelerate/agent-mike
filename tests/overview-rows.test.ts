import { describe, expect, it } from "vitest";
import { DEFAULT_ROW_LIMIT, visibleRows } from "../frontend/src/lib/overview-rows";

const desk = ["General Questions", "Get IT help", "Onboard new employees", "Professional Services", "Report a Bug", "Report a system problem", "Report broken hardware", "Request a new account", "Request a New Feature", "System Unavailable", "Training Request"];
const rows = (counts: Record<string, number> = {}) => desk.map((name) => ({ name, count: counts[name] ?? 0 }));

describe("which request types a card shows", () => {
  it("shows everything when the desk is short, with nothing hidden", () => {
    const short = rows().slice(0, 4);
    expect(visibleRows(short, DEFAULT_ROW_LIMIT, false)).toEqual({ shown: short, hidden: 0 });
  });

  it("puts the types that have tickets first, biggest first, then tops up in the desk's own order", () => {
    const { shown, hidden } = visibleRows(rows({ "Report a Bug": 1, "System Unavailable": 3 }), 6, false);
    expect(shown.map((row) => row.name)).toEqual(["System Unavailable", "Report a Bug", "General Questions", "Get IT help", "Onboard new employees", "Professional Services"]);
    expect(hidden).toBe(desk.length - 6);
  });

  it("keeps the desk's order among types with the same count", () => {
    const { shown } = visibleRows(rows({ "Training Request": 2, "Get IT help": 2 }), 3, false);
    expect(shown.map((row) => row.name).slice(0, 2)).toEqual(["Get IT help", "Training Request"]);
  });

  it("never drops a type that has tickets, however many rows are asked for", () => {
    const busy = rows(Object.fromEntries(desk.slice(0, 8).map((name, index) => [name, index + 1])));
    const { shown } = visibleRows(busy, 6, false);
    expect(shown.filter((row) => row.count > 0)).toHaveLength(6);
    expect(shown[0].count).toBeGreaterThanOrEqual(shown[5].count);
  });

  it("shows all of them, in the desk's order, once expanded", () => {
    const all = rows({ "Report a Bug": 1 });
    expect(visibleRows(all, 6, true)).toEqual({ shown: all, hidden: 0 });
  });

  it("does not change the list it is given", () => {
    const input = rows({ "Report a Bug": 1 });
    const copy = JSON.stringify(input);
    visibleRows(input, 6, false);
    expect(JSON.stringify(input)).toBe(copy);
  });
});
