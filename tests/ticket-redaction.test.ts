import { describe, expect, it } from "vitest";
import { isSensitiveTicketText, looksLikeItStillHoldsAName, nameVariants, redactTicketText } from "@/lib/ticket-redaction";

const redact = (text: string, names: string[] = []) => redactTicketText(text, names).text;

describe("redactTicketText", () => {
  it("removes emails, links and phone numbers", () => {
    expect(redact("Contact dana.smith@acme-eap.com or call (416) 555-0188 ext 12.")).toBe("Contact [email] or call [phone].");
    expect(redact("See https://eapexpert.atlassian.net/browse/EESD-123 and www.example.com/path?id=9")).toBe("See [link] and [link]");
    expect(redact("Call +1 905-702-1380 or 905.702.1380")).toBe("Call [phone] or [phone]");
  });

  it("removes case and account numbers, ID numbers, dates of birth, addresses and postal codes", () => {
    expect(redact("Case 20481377 and file ACC-77120045 are affected")).toBe("Case [number] and file [number] are affected");
    expect(redact("SIN 123-45-6789 on the form")).toBe("SIN [id number] on the form");
    expect(redact("DOB: 1984-03-12 was wrong, born on March 4, 1990 too")).toBe("[date of birth] was wrong, [date of birth] too");
    expect(redact("Office at 482 King Street West, Toronto M5V 2T6")).toBe("Office at [address] West, Toronto [postal code]");
    expect(redact("Ship to Austin TX 78701")).toBe("Ship to Austin [postal code]");
  });

  it("keeps ordinary numbers that help diagnose a problem", () => {
    expect(redact("Error 10054 on build 2026.09.15, 3 users, 25 forms")).toBe("Error 10054 on build 2026.09.15, 3 users, 25 forms");
  });

  it("removes the names of the people on the ticket, whole and in part, in any case", () => {
    const names = ["Dana Smith", "Alec Shewell"];
    expect(redact("Dana Smith says Smith's login fails. dana asked ALEC to look; Shewell agreed.", names)).toBe(
      "[name] says [name]'s login fails. [name] asked [name] to look; [name] agreed.",
    );
  });

  it("does not damage ordinary words that happen to be part of a name", () => {
    expect(redact("Mark the form as done, and the will field stays", ["Mark Will"])).toBe("Mark the form as done, and the will field stays");
    expect(nameVariants(["Mark Will"])).toEqual(["Mark Will"]);
  });

  it("removes names in greetings, sign-offs and titles, and keeps the greeting", () => {
    expect(redact("Hi Dana, thanks for writing.\nRegards, Alec Shewell")).toBe("Hi [name], thanks for writing.\nRegards, [name]");
    expect(redact("Dr. Patel and Ms Lopez joined")).toBe("[name] and [name] joined");
    expect(redact("Thanks for the update")).toBe("Thanks for the update");
  });

  it("removes Jira mentions", () => {
    expect(redact("cc [~accountid:5b10ac8d82e05b22cc7d4ef5] and @dana.s please")).toBe("cc [name] and [name] please");
  });

  it("reports what it removed", () => {
    const { counts } = redactTicketText("a@b.com, c@d.org, 20481377, https://x.io", []);
    expect(counts).toEqual({ links: 1, emails: 2, numbers: 1 });
  });

  it("leaves no trace of the originals in the output", () => {
    const original = "Dana Smith (dana.smith@acme.com, 416-555-0188) of 482 King Street reported case 20481377: Dana's DOB 1984-03-12 shows wrong.";
    const out = redact(original, ["Dana Smith"]);
    for (const secret of ["Dana", "Smith", "acme.com", "416", "0188", "King Street", "20481377", "1984"]) expect(out).not.toContain(secret);
  });
});

describe("isSensitiveTicketText", () => {
  it("flags health, counselling-note and identity-document wording", () => {
    for (const text of [
      "The client's diagnosis field is blank",
      "Medication list not saving",
      "Session notes are missing for last week",
      "Counselling notes export fails",
      "Need to update date of birth",
      "Passport number field",
      "Her SIN number was exposed",
      "Mentions suicidal thoughts in the note",
    ]) {
      expect(isSensitiveTicketText(text), text).toBe(true);
    }
  });

  it("does not flag ordinary software problems", () => {
    for (const text of ["Cannot reset my password", "The scheduler shows the wrong time zone", "Client record page loads slowly", "Report export to Excel fails for 3 users"]) {
      expect(isSensitiveTicketText(text), text).toBe(false);
    }
  });
});

describe("looksLikeItStillHoldsAName", () => {
  it("notices a name pair that survived, and ignores product and screen names", () => {
    expect(looksLikeItStillHoldsAName("The fix was tested with Jordan Whitfield yesterday.")).toBe(true);
    expect(looksLikeItStillHoldsAName("Open Dynamic Forms and click Save Changes in Online Intake.")).toBe(false);
    expect(looksLikeItStillHoldsAName("Reset the password from the sign-in page.")).toBe(false);
  });
});
