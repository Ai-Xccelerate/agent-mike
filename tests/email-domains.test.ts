import { describe, expect, it } from "vitest";
import {
  approvedDomains,
  countByStatus,
  createDomainSchema,
  decisionSchema,
  isNoOp,
  isRecipientAllowed,
  isValidDomain,
  normalizeDomain,
  statusAfter,
} from "@/lib/email-domains";

describe("domain normalization", () => {
  it("reduces the shapes people actually paste to one hostname", () => {
    expect(normalizeDomain("ACME.com")).toBe("acme.com");
    expect(normalizeDomain("  acme.com  ")).toBe("acme.com");
    expect(normalizeDomain("@acme.com")).toBe("acme.com");
    expect(normalizeDomain("someone@acme.com")).toBe("acme.com");
    expect(normalizeDomain("https://acme.com")).toBe("acme.com");
    expect(normalizeDomain("https://acme.com/careers?x=1#top")).toBe("acme.com");
    expect(normalizeDomain("acme.com:443")).toBe("acme.com");
    expect(normalizeDomain("acme.com.")).toBe("acme.com");
  });

  it("collapses the spellings that would otherwise become separate rows", () => {
    const spellings = ["Acme.com", "acme.com/", "hi@ACME.com", "https://acme.com"];
    expect(new Set(spellings.map(normalizeDomain)).size).toBe(1);
  });

  it("survives empty input", () => {
    expect(normalizeDomain("")).toBe("");
    expect(normalizeDomain("   ")).toBe("");
  });
});

describe("domain validation", () => {
  it("accepts ordinary hostnames", () => {
    for (const value of ["acme.com", "acme-corp.com", "mail.acme.co.uk", "a.io", "x1.example.org"]) {
      expect(isValidDomain(value)).toBe(true);
    }
  });

  it("refuses typos and pasted prose", () => {
    for (const value of [
      "",
      "acme",
      "acme.",
      ".com",
      "acme .com",
      "acme_corp.com",
      "acme..com",
      "-acme.com",
      "acme-.com",
      "acme.c",
      "acme.123",
    ]) {
      expect(isValidDomain(value)).toBe(false);
    }
  });

  it("refuses anything longer than a hostname may be", () => {
    expect(isValidDomain(`${"a".repeat(64)}.com`)).toBe(false);
    expect(isValidDomain(`${"a".repeat(250)}.com`)).toBe(false);
  });
});

describe("create payload", () => {
  it("normalizes on the way in, so the stored value is already canonical", () => {
    const parsed = createDomainSchema.parse({ domain: " Someone@ACME.com " });
    expect(parsed.domain).toBe("acme.com");
    expect(parsed.reason).toBeNull();
    expect(parsed.requestedBy).toBe("manager");
  });

  it("keeps a reason and records who asked", () => {
    const parsed = createDomainSchema.parse({
      domain: "acme.com",
      reason: "Shared project updates",
      requestedBy: "agent",
    });
    expect(parsed.reason).toBe("Shared project updates");
    expect(parsed.requestedBy).toBe("agent");
  });

  it("treats an empty reason as no reason", () => {
    expect(createDomainSchema.parse({ domain: "acme.com", reason: "   " }).reason).toBeNull();
  });

  it("rejects an invalid domain and an over-long reason", () => {
    expect(createDomainSchema.safeParse({ domain: "not a domain" }).success).toBe(false);
    expect(
      createDomainSchema.safeParse({ domain: "acme.com", reason: "x".repeat(501) }).success,
    ).toBe(false);
  });
});

describe("decisions", () => {
  it("maps each action to the state it produces", () => {
    expect(statusAfter("approve")).toBe("approved");
    expect(statusAfter("revoke")).toBe("revoked");
  });

  it("treats repeating a decision as a no-op, so decidedAt is not rewritten", () => {
    expect(isNoOp("approved", "approve")).toBe(true);
    expect(isNoOp("revoked", "revoke")).toBe(true);
    expect(isNoOp("pending", "approve")).toBe(false);
    expect(isNoOp("revoked", "approve")).toBe(false);
    expect(isNoOp("approved", "revoke")).toBe(false);
  });

  it("accepts only the two decisions that exist", () => {
    expect(decisionSchema.safeParse({ decision: "approve" }).success).toBe(true);
    expect(decisionSchema.safeParse({ decision: "revoke" }).success).toBe(true);
    expect(decisionSchema.safeParse({ decision: "pending" }).success).toBe(false);
    expect(decisionSchema.safeParse({ decision: "delete" }).success).toBe(false);
  });
});

describe("recipient checks", () => {
  const rows = [
    { domain: "acme.com", status: "approved" },
    { domain: "pending.com", status: "pending" },
    { domain: "gone.com", status: "revoked" },
  ];

  it("allows only approved domains", () => {
    expect(isRecipientAllowed("someone@acme.com", rows)).toBe(true);
    expect(isRecipientAllowed("someone@pending.com", rows)).toBe(false);
    expect(isRecipientAllowed("someone@gone.com", rows)).toBe(false);
    expect(isRecipientAllowed("someone@unknown.com", rows)).toBe(false);
  });

  it("does not let an approved domain carry its subdomains", () => {
    expect(isRecipientAllowed("someone@mail.acme.com", rows)).toBe(false);
  });

  it("fails closed on an empty list and on junk input", () => {
    expect(isRecipientAllowed("someone@acme.com", [])).toBe(false);
    expect(isRecipientAllowed("", rows)).toBe(false);
  });

  it("lists the approved domains only", () => {
    expect(approvedDomains(rows)).toEqual(["acme.com"]);
  });
});

describe("status counts", () => {
  it("counts each state for the summary tiles", () => {
    expect(
      countByStatus([
        { domain: "a.com", status: "approved" },
        { domain: "b.com", status: "approved" },
        { domain: "c.com", status: "pending" },
        { domain: "d.com", status: "revoked" },
      ]),
    ).toEqual({ pending: 1, approved: 2, revoked: 1 });
  });

  it("starts at zero and ignores a status it does not know", () => {
    expect(countByStatus([])).toEqual({ pending: 0, approved: 0, revoked: 0 });
    expect(countByStatus([{ domain: "a.com", status: "nonsense" }])).toEqual({
      pending: 0,
      approved: 0,
      revoked: 0,
    });
  });
});
