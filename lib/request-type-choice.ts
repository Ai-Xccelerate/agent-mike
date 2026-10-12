import { Agent, run } from "@openai/agents";
import { z } from "zod";
import { guardrailModel, modelUnavailabilityReason } from "@/lib/env";
import type { RequestTypeChoice } from "@/lib/tools-integrations/atlassian";

/**
 * Picks the service desk request type for a handoff, and the values of the
 * fields it needs, from the conversation and the desk's own list. The list
 * comes from Jira (describeRequestTypes), so nothing here knows any one
 * client's request types.
 */

const ChoiceSchema = z.object({
  requestTypeId: z.string().nullable(),
  fields: z.array(z.object({ fieldId: z.string(), values: z.array(z.string()) })),
});

export async function chooseRequestType(args: {
  catalogText: string;
  conversation: string;
  /** Why the last choice couldn't be used, so this one fixes it. */
  problem?: string;
}): Promise<RequestTypeChoice | { problem: string }> {
  if (modelUnavailabilityReason()) return { problem: "No model is available to choose the request type" };

  const chooser = new Agent({
    name: "Request type chooser",
    instructions:
      "A support worker is handing this conversation to a person, and a ticket is being raised on the team's " +
      "service desk. Choose the request type that fits what the customer needs, judging by each type's " +
      "description, and fill in its fields from what the conversation says. Use the field ids in square " +
      "brackets and, for fields with options, one of the listed options exactly. Judge fields like priority " +
      "yourself from the impact the customer describes. For text fields, write what the customer asked for in " +
      "your own words. Never invent facts the conversation doesn't contain. Set requestTypeId to null only if " +
      "no type fits at all.\n\n" +
      `Request types (id in brackets after the dash):\n${args.catalogText}`,
    model: guardrailModel(),
    outputType: ChoiceSchema,
    modelSettings: { reasoning: { effort: "none" }, text: { verbosity: "low" } },
  });

  const prompt =
    `Conversation:\n${args.conversation}` +
    (args.problem ? `\n\nYour last choice couldn't be used: ${args.problem}\nChoose again, fixing that.` : "");

  try {
    const result = await run(chooser, prompt, { maxTurns: 1 });
    const parsed = ChoiceSchema.safeParse(result.finalOutput);
    return parsed.success ? parsed.data : { problem: "The request type choice came back malformed" };
  } catch (error) {
    return { problem: `Couldn't choose a request type: ${error instanceof Error ? error.message : "unknown error"}` };
  }
}
