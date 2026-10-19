import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIdentityAdapter } from "@/lib/identity";
import { isOrgAdmin } from "@/lib/org-roles";
import { TRANSCRIBE_MAX_BYTES, TranscriptionError, transcribeAudio } from "@/lib/transcription";

export const dynamic = "force-dynamic";

type UploadedAudio = { type?: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> };

/**
 * Turns a recording from the Assistant's mic into text. Managers only: it
 * spends the org's OpenAI budget, and the customer widget doesn't use it.
 * The audio is sent on and never stored.
 */
export async function POST(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  if (!isOrgAdmin(tenant.role)) {
    return NextResponse.json({ error: "Only org admins can do this" }, { status: 403 });
  }

  const declared = Number(req.headers.get("content-length") || "0");
  if (declared > TRANSCRIBE_MAX_BYTES + 1024 * 1024) {
    return NextResponse.json({ error: "That recording is too long. Try a shorter one." }, { status: 413 });
  }

  const form = await req.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!audio || typeof audio === "string") {
    return NextResponse.json({ error: "No audio provided" }, { status: 400 });
  }
  const file = audio as unknown as UploadedAudio;

  try {
    const text = await transcribeAudio(Buffer.from(await file.arrayBuffer()), file.type || "");
    return NextResponse.json({ text });
  } catch (error) {
    if (error instanceof TranscriptionError) {
      const status = error.kind === "rejected" ? 422 : error.kind === "unavailable" ? 503 : 502;
      return NextResponse.json({ error: error.message }, { status });
    }
    console.warn("[transcribe] unexpected:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Transcription failed. Try again." }, { status: 500 });
  }
}
