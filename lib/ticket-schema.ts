import { z } from "zod";

/**
 * The words a worker may classify a ticket with. They differ per worker: a
 * support worker's labels are not a product manager's, so the classifier only
 * ever picks from the worker's own lists and never invents a label.
 */

export type TicketSchema = { requestTypes: string[]; tiers: string[]; labels: string[] };

export const DEFAULT_TICKET_SCHEMA: TicketSchema = {
  requestTypes: ["Question", "Problem", "Request", "Feedback", "Other"],
  tiers: ["Tier 1", "Tier 2", "Tier 3"],
  labels: ["urgent", "outage", "billing", "bug", "feature-request"],
};

const MAX_ITEMS = 30;
const MAX_LENGTH = 40;

const wordList = (max: number) =>
  z
    .array(z.string().trim().min(1, "Entries cannot be blank").max(MAX_LENGTH, `Keep each entry under ${MAX_LENGTH + 1} characters`))
    .max(max, `Use at most ${max} entries`)
    .refine((items) => new Set(items.map((item) => item.toLowerCase())).size === items.length, "Entries must be different from each other");

/** The PATCH /worker field. Tiers and request types cannot be emptied: the classifier needs something to choose from. */
export const ticketSchemaPatch = z
  .object({
    requestTypes: wordList(MAX_ITEMS).refine((items) => items.length > 0, "Add at least one request type"),
    tiers: wordList(10).refine((items) => items.length > 0, "Add at least one tier"),
    labels: wordList(MAX_ITEMS),
  })
  .strict()
  .nullable();

/** What the worker classifies with: its own lists, else the defaults. */
export function resolveTicketSchema(stored: Partial<TicketSchema> | null | undefined): TicketSchema {
  return {
    requestTypes: stored?.requestTypes?.length ? stored.requestTypes : DEFAULT_TICKET_SCHEMA.requestTypes,
    tiers: stored?.tiers?.length ? stored.tiers : DEFAULT_TICKET_SCHEMA.tiers,
    labels: stored?.labels ?? DEFAULT_TICKET_SCHEMA.labels,
  };
}
