import { describe, expect, it } from "vitest";
import { htmlToText, inboundEmailText, replySubject, stripQuotedReply, textToEmailHtml } from "@/lib/email-text";

describe("inbound email text", () => {
  it("turns HTML into readable text", () => {
    expect(htmlToText("<div>Hi team,</div><div><br></div><p>My login &amp; password <b>fail</b>.</p><style>p{}</style>")).toBe(
      "Hi team,\n\nMy login & password fail.",
    );
  });

  it("keeps only what the customer just wrote above a Gmail quote", () => {
    const text = "Still broken, sorry.\n\nOn Tue, 30 Sep 2026 at 10:02, Mike <mike@aiwkr.com>\nwrote:\n> Try resetting it.";
    expect(stripQuotedReply(text)).toBe("Still broken, sorry.");
  });

  it("keeps only what the customer just wrote above an Outlook quote", () => {
    const text = "Thanks, that worked.\n\nFrom: Mike <mike@aiwkr.com>\nSent: Tuesday\nSubject: Re: Login";
    expect(stripQuotedReply(text)).toBe("Thanks, that worked.");
  });

  it("drops quoted lines and falls back to the snippet when nothing is left", () => {
    expect(stripQuotedReply("New line\n> old line")).toBe("New line");
    expect(inboundEmailText("", "Snippet text")).toBe("Snippet text");
  });
});

describe("outbound email formatting", () => {
  it("escapes and keeps paragraphs and line breaks", () => {
    expect(textToEmailHtml("Hi <Anna>,\n\nLine one\nLine two")).toBe("<p>Hi &lt;Anna&gt;,</p>\n<p>Line one<br>Line two</p>");
  });

  it("prefixes Re: once", () => {
    expect(replySubject("Login broken")).toBe("Re: Login broken");
    expect(replySubject("RE: Login broken")).toBe("RE: Login broken");
    expect(replySubject(null)).toBe("Re: Your message");
  });
});
