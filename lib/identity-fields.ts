import { z } from "zod";

const RESERVED_SLUGS = new Set(["api", "admin", "settings", "health", "widget", "webhooks"]);

export function isValidTimezone(value: string): boolean {
  if (!value.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function isValidLocale(value: string): boolean {
  if (!/^[A-Za-z]{2,8}(-[A-Za-z0-9]{2,8})*$/.test(value)) return false;
  try {
    return Boolean(new Intl.Locale(value).language);
  } catch {
    return false;
  }
}

export const slugSchema = z
  .string()
  .regex(/^[a-z0-9-]{2,32}$/, "Use 2–32 lowercase letters, numbers or hyphens")
  .refine((v) => !v.startsWith("-") && !v.endsWith("-"), "Cannot start or end with a hyphen")
  .refine((v) => !RESERVED_SLUGS.has(v), "That slug is reserved");

export const accentColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Must be a hex colour such as #4F46E5");

export const identityFieldSchemas = {
  slug: slugSchema,
  status: z.enum(["active", "paused"]),
  avatarUrl: z
    .string()
    .refine((value) => {
      if (value.startsWith("/") && !value.startsWith("//")) return true;
      try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    }, "Must be a valid URL")
    .nullable(),
  accentColor: accentColorSchema,
  bio: z.string().max(500),
  timezone: z.string().refine(isValidTimezone, "Must be a valid IANA timezone such as Europe/London"),
  locale: z.string().refine(isValidLocale, "Must be a valid BCP-47 locale such as en-GB"),
  emailSignature: z.string().max(300),
};

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path.length ? issue.path.map(String).join(".") : "_";
    if (!(field in errors)) errors[field] = issue.message;
  }
  return errors;
}
