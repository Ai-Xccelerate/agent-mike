import { z } from "zod";
import { INTEGRATION_TYPES } from "@/lib/tools-integrations/registry";

export const INTEGRATION_TYPE_IDS = INTEGRATION_TYPES.map((entry) => entry.type);

const integrationTypeIdSchema = z
  .string()
  .min(1)
  .refine((value) => INTEGRATION_TYPE_IDS.includes(value), {
    message: `Unknown integration type. Must be one of: ${INTEGRATION_TYPE_IDS.join(", ")}`,
  });

export const customSkillCreateSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  requires: z.array(integrationTypeIdSchema),
  body: z.string().min(1),
});

export const customSkillPatchSchema = customSkillCreateSchema.partial();

export type CustomSkillCreateInput = z.infer<typeof customSkillCreateSchema>;
export type CustomSkillPatchInput = z.infer<typeof customSkillPatchSchema>;
