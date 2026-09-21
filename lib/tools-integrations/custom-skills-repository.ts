import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { customSkills } from "@/db/schema";

export type CustomSkill = typeof customSkills.$inferSelect;

export type CreateCustomSkillInput = {
  organizationId: string;
  name: string;
  description: string;
  requires: string[];
  body: string;
};

export type UpdateCustomSkillFields = Partial<{
  name: string;
  description: string;
  requires: string[];
  body: string;
}>;

export async function listCustomSkills(organizationId: string): Promise<CustomSkill[]> {
  return db.select().from(customSkills).where(eq(customSkills.organizationId, organizationId));
}

export async function getCustomSkill(
  organizationId: string,
  id: string,
): Promise<CustomSkill | null> {
  const [row] = await db
    .select()
    .from(customSkills)
    .where(and(eq(customSkills.organizationId, organizationId), eq(customSkills.id, id)))
    .limit(1);
  return row ?? null;
}

export async function createCustomSkill(input: CreateCustomSkillInput): Promise<CustomSkill> {
  const [row] = await db
    .insert(customSkills)
    .values({
      organizationId: input.organizationId,
      name: input.name,
      description: input.description,
      requires: input.requires,
      body: input.body,
    })
    .returning();
  return row;
}

export async function updateCustomSkill(
  organizationId: string,
  id: string,
  fields: UpdateCustomSkillFields,
): Promise<CustomSkill | null> {
  const [row] = await db
    .update(customSkills)
    .set({ ...fields, updatedAt: new Date() })
    .where(and(eq(customSkills.organizationId, organizationId), eq(customSkills.id, id)))
    .returning();
  return row ?? null;
}

export async function deleteCustomSkill(organizationId: string, id: string): Promise<boolean> {
  const deleted = await db
    .delete(customSkills)
    .where(and(eq(customSkills.organizationId, organizationId), eq(customSkills.id, id)))
    .returning({ id: customSkills.id });
  return deleted.length > 0;
}
