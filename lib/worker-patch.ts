import { z } from "zod";
import { fieldErrors, identityFieldSchemas } from "@/lib/identity-fields";
import { integrationsConfigSchema } from "@/lib/integrations";

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
    managerName: z.string().min(1),
    managerEmail: emptyToNull(z.string().email().nullable()),
    autoReply: z.boolean(),
    toolsConfig: z.record(z.string(), z.boolean()),
    enabledSkills: z.array(z.string()),
    channelsConfig: z.object({ email: z.boolean(), chat: z.boolean(), voice: z.boolean() }),
    integrationsConfig: integrationsConfigSchema,
    ticketPrefix: z.string().min(1).max(12),
  })
  .partial();

export { fieldErrors };

export function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string; cause?: { code?: string } };
  return candidate.code === "23505" || candidate.cause?.code === "23505";
}
