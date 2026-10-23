/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from "next/server";
import { POST as postFeedback } from "@/app/api/v1/messages/[id]/feedback/route";

/** Rates a reply as a manager of the organization (the test identity adapter reads x-test-org). */
export function postFeedbackFor(orgId: string, messageId: string, body: unknown) {
  return postFeedback(
    new NextRequest(`http://t/api/v1/messages/${messageId}/feedback`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-org": orgId },
      body: JSON.stringify(body),
      duplex: "half",
    } as any),
    { params: { id: messageId } },
  );
}
