import { z } from "zod";
import { fieldErrors, identityFieldSchemas } from "@/lib/identity-fields";
import { integrationsConfigSchema } from "@/lib/integrations";
import { ticketSchemaPatch } from "@/lib/ticket-schema";

const emptyToNull = (schema: z.ZodType<string | null>) =>
  z.union([z.literal(""), schema]).transform((value) => (value === "" ? null : value));

export const workerPatchSchema = z
  .object({
    name: z.string().min(1),
    displayName: z.string().min(1),
    avatarInitials: z.string().min(1).max(4),
    slug: identityFieldSchemas.slug,
    status: identityFieldSchemas.status,
    avatarUrl: emptyToNull(identityFieldSchemas.avatarUrl),
    accentColor: identityFieldSchemas.accentColor,
    title: identityFieldSchemas.title,
    bio: identityFieldSchemas.bio,
    timezone: identityFieldSchemas.timezone,
    locale: identityFieldSchemas.locale,
    email: emptyToNull(z.string().email().nullable()),
    emailSignature: identityFieldSchemas.emailSignature,
    tone: z.string().min(1),
    role: z.string().min(1),
    jobDescription: z.string().nullable(),
    systemPromptTemplate: z.string().min(1),
    model: z.string().min(1),
    maxAgentTurns: z.number().int().min(1).max(10),
    confidenceThreshold: z.number().min(0).max(1),
    escalationTerms: z.array(z.string()),
    allowedDomains: z.array(z.string()),
    requireUserVerification: z.boolean(),
    // Settings > Guardrails > Customer identity (lib/customer-identity.ts).
    identityMode: z.enum(["off", "email_match", "email_code"]),
    // The widget's opening message and the tap-to-send chips under it. null = back to the built-in ones.
    welcomeMessage: z.union([z.literal(""), z.string().trim().max(300)]).nullable().transform((value) => (value ? value : null)),
    quickActions: z
      .array(z.string().trim().min(1, "A quick action can't be empty").max(40, "Keep a quick action under 40 characters"))
      .max(6, "Six quick actions at most")
      .nullable(),
    // Shipped as a column with no way to set it. Fail-closed by default, so
    // without this the only way to let a worker auto-execute write tools was
    // editing the database by hand.
    requireWriteApproval: z.boolean(),
    assistantActionsEnabled: z.boolean(),
    managerName: z.string().min(1),
    managerEmail: emptyToNull(z.string().email().nullable()),
    autoReply: z.boolean(),
    emailManagerOnHandoff: z.boolean(),
    // Visitors may attach files in the website chat (passed to the team).
    chatAttachments: z.boolean(),
    firstReplyTargetHours: z.number().int().min(1).max(720).nullable(),
    // Settings > Email domains: on = only approved domains may be emailed.
    restrictEmailDomains: z.boolean(),
    toolsConfig: z.record(z.string(), z.boolean()),
    enabledSkills: z.array(z.string()),
    channelsConfig: z.object({ email: z.boolean(), chat: z.boolean(), voice: z.boolean() }),
    integrationsConfig: integrationsConfigSchema,
    ticketPrefix: z.string().min(1).max(12),
    // null = back to the built-in request types, tiers and labels.
    ticketSchema: ticketSchemaPatch,
  })
  .partial()
  // Strict so a misspelled field fails loudly instead of returning 200 and
  // silently changing nothing — which is what a client bug looks like from the
  // outside. The integration endpoints already behave this way.
  .strict();

export { fieldErrors };

export function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string; cause?: { code?: string } };
  return candidate.code === "23505" || candidate.cause?.code === "23505";
}
