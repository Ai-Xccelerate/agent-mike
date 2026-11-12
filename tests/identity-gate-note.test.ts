import { describe, expect, it } from "vitest";
import { identityGateNote } from "../frontend/src/lib/identity-gate-note";

describe("what the Customer identity setting says about the details form", () => {
  const base = { requireUserVerification: false, logsEveryConversation: false };

  it("says customers can chat freely when nothing asks for details", () => {
    expect(identityGateNote({ ...base, identityMode: "off" })).toMatchObject({ tone: "info" });
    expect(identityGateNote({ ...base, identityMode: "email_code" }).text).toMatch(/without giving details/);
  });

  it("explains the form, and what causes it, when every conversation is logged", () => {
    const note = identityGateNote({ ...base, identityMode: "email_code", logsEveryConversation: true });
    expect(note.tone).toBe("info");
    expect(note.text).toMatch(/emailed code/);
    expect(note.text).toMatch(/every conversation is logged/);
    expect(note.text).toMatch(/Integrations > Jira/);
  });

  it("leaves out the code when only name and email are asked", () => {
    const note = identityGateNote({ ...base, identityMode: "email_match", logsEveryConversation: true });
    expect(note.text).not.toMatch(/emailed code/);
  });

  it("names the CRM customer check as the cause when that is what asks", () => {
    const note = identityGateNote({ ...base, identityMode: "email_match", requireUserVerification: true });
    expect(note.text).toMatch(/the CRM customer check is on/);
    expect(note.text).toMatch(/Check customers against the CRM/);
  });

  it("warns when every conversation is logged but nobody is asked who they are", () => {
    const note = identityGateNote({ ...base, identityMode: "off", logsEveryConversation: true });
    expect(note.tone).toBe("warning");
  });

  it("does not warn about the CRM check alone, which has nothing to do with the form", () => {
    expect(identityGateNote({ ...base, identityMode: "off", requireUserVerification: true }).tone).toBe("info");
  });
});

