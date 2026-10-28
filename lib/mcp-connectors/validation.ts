import { z } from "zod";

/** HTTP header names: RFC 7230 token characters. Hop-by-hop and framing headers are refused. */
const HEADER_NAME = /^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,64}$/;
const RESERVED_HEADERS = new Set(["host", "content-length", "content-type", "connection", "transfer-encoding", "accept", "cookie"]);

const authFields = {
  authType: z.enum(["none", "bearer", "header"]).default("none"),
  headerName: z
    .string()
    .trim()
    .max(64)
    .optional()
    .nullable()
    .refine((value) => !value || (HEADER_NAME.test(value) && !RESERVED_HEADERS.has(value.toLowerCase())), {
      message: "Use a plain header name, like X-API-Key.",
    }),
  secret: z.string().trim().max(4096).optional().nullable(),
};

export const createConnectorSchema = z
  .object({
    name: z.string().trim().min(1, "Give the connector a name.").max(60, "Keep the name under 60 characters."),
    url: z.string().trim().min(1, "Enter the server URL.").max(2048),
    ...authFields,
  })
  .superRefine((value, ctx) => {
    if (value.authType !== "none" && !value.secret) {
      ctx.addIssue({ code: "custom", path: ["secret"], message: "Enter the token or key." });
    }
    if (value.authType === "header" && !value.headerName) {
      ctx.addIssue({ code: "custom", path: ["headerName"], message: "Enter the header name." });
    }
  });

export const updateConnectorSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  enabled: z.boolean().optional(),
  /** Partial: only the tools named here change. */
  toolPermissions: z.record(z.string(), z.enum(["auto", "approval", "off"])).optional(),
  /** Present only when the admin replaces the credentials. A missing secret keeps the saved one. */
  auth: z.object(authFields).optional(),
});
