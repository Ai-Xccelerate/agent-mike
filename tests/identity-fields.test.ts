import { describe, expect, it } from "vitest";
import { identityFieldSchemas, slugSchema } from "@/lib/identity-fields";
import { workerPatchSchema } from "@/lib/worker-patch";

describe("identity field schemas", () => {
  it("accepts a valid slug, hex colour, timezone, and locale", () => {
    expect(slugSchema.safeParse("support-worker").success).toBe(true);
    expect(identityFieldSchemas.accentColor.safeParse("#4F46E5").success).toBe(true);
    expect(identityFieldSchemas.timezone.safeParse("Asia/Calcutta").success).toBe(true);
    expect(identityFieldSchemas.locale.safeParse("en-IN").success).toBe(true);
  });

  it("rejects invalid slug and accent colour", () => {
    expect(slugSchema.safeParse("Bad Slug").success).toBe(false);
    expect(slugSchema.safeParse("api").success).toBe(false);
    expect(identityFieldSchemas.accentColor.safeParse("blue").success).toBe(false);
  });

  it("rejects invalid timezone, locale, and overlong bio", () => {
    expect(identityFieldSchemas.timezone.safeParse("Not/A_Timezone").success).toBe(false);
    expect(identityFieldSchemas.locale.safeParse("english_US").success).toBe(false);
    expect(identityFieldSchemas.bio.safeParse("x".repeat(501)).success).toBe(false);
  });

  it("accepts a payload with only the original identity fields", () => {
    const parsed = workerPatchSchema.safeParse({
      name: "Worker",
      displayName: "AI Worker",
      avatarInitials: "AW",
      email: null,
      tone: "Warm, concise, and honest about uncertainty.",
    });
    expect(parsed.success).toBe(true);
  });

  it("coerces empty avatar and email strings to null", () => {
    const parsed = workerPatchSchema.safeParse({ avatarUrl: "", email: "" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.avatarUrl).toBeNull();
      expect(parsed.data.email).toBeNull();
    }
  });

  it("rejects an invalid identity patch with field errors", () => {
    const parsed = workerPatchSchema.safeParse({ slug: "API", accentColor: "blue" });
    expect(parsed.success).toBe(false);
  });
});
