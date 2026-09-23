import type { TenantContext } from "@/lib/identity";

/** Org-wide settings mutations require owner/admin; member is read-level. */
export function isOrgAdmin(role: TenantContext["role"]): boolean {
  return role === "owner" || role === "admin";
}
