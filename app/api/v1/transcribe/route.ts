import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIdentityAdapter } from "@/lib/identity";
import { isOrgAdmin } from "@/lib/org-roles";
import { clientIp, checkRateLimit } from "@/lib/rate-limit";
import {
  TRANSCRIBE_MAX_BYTES,
  TranscriptionError,
  WIDGET_LIMITS,
  WIDGET_MAX_BYTES,
  transcribeAudio,
} from "@/lib/transcription";

export const dynamic = "force-dynamic";

type UploadedAudio = { type?: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> };

// Next.js allows only handlers and route config as exports here, so the limits live in lib/transcription.ts.
function tooMany(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: "You've used voice input a lot. Please wait a moment and try again." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}

/**
 * Turns a recording from a mic into text. Two callers:
 * - a signed-in org admin (the Assistant and the Playground);
 * - the website widget, with its site token. Anonymous visitors can reach it,
 *   so it takes only short recordings and is limited per address and per site.
 * It spends the org's OpenAI budget. The audio is sent on and never stored.
 */
export async function POST(req: NextRequest) {
  const identity = getIdentityAdapter();
  const isWidget = Boolean(req.headers.get("x-worker-site-token")?.trim());
  const tenant = isWidget ? await identity.resolveWidgetRequest(req) : await identity.resolveManagerRequest(req);
  if (!tenant) {
    return NextResponse.json({ error: "Invalid or missing site token" }, { status: 401 });
  }
  if (!isWidget && !isOrgAdmin(tenant.role)) {
    return NextResponse.json({ error: "Only org admins can do this" }, { status: 403 });
  }

  const maxBytes = isWidget ? WIDGET_MAX_BYTES : TRANSCRIBE_MAX_BYTES;
  const declared = Number(req.headers.get("content-length") || "0");
  if (declared > maxBytes + 1024 * 1024) {
    return NextResponse.json({ error: "That recording is too long. Try a shorter one." }, { status: 413 });
  }

  if (isWidget) {
    const ip = checkRateLimit(`transcribe:ip:${tenant.orgId}:${clientIp(req.headers)}`, WIDGET_LIMITS.perIp.limit, WIDGET_LIMITS.perIp.windowMs);
    if (!ip.allowed) return tooMany(ip.retryAfterSeconds);
    const site = checkRateLimit(`transcribe:site:${tenant.orgId}`, WIDGET_LIMITS.perSite.limit, WIDGET_LIMITS.perSite.windowMs);
    if (!site.allowed) return tooMany(site.retryAfterSeconds);
  }

  const form = await req.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!audio || typeof audio === "string") {
    return NextResponse.json({ error: "No audio provided" }, { status: 400 });
  }
  const file = audio as unknown as UploadedAudio;
  if (file.size > maxBytes) {
    return NextResponse.json({ error: "That recording is too long. Try a shorter one." }, { status: 413 });
  }

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
