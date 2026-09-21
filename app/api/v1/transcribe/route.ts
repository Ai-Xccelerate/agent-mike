import { NextRequest, NextResponse } from "next/server";
import { getIdentityAdapter } from "@/lib/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 25 * 1024 * 1024;
const DEFAULT_MODEL = "gpt-transcribe";
const DEFAULT_PROMPT =
  "Customer dictating a product-support question to Agent Mike. Prefer clear English for setup, sign-in, invites, billing, and account issues. Ignore background noise; do not invent filler phrases.";

function appendLanguage(upstream: FormData, model: string, language: string) {
  if (!language) return;
  if (model === "whisper-1" || model.includes("4o-transcribe")) {
    upstream.append("language", language);
  } else {
    upstream.append("languages[]", language);
  }
}

export async function POST(req: NextRequest) {
  const identity = getIdentityAdapter();
  const isWidget = Boolean(
    req.headers.get("x-worker-site-token") || req.headers.get("x-mike-site-token"),
  );
  const tenant = isWidget
    ? await identity.resolveWidgetRequest(req)
    : await identity.resolveManagerRequest(req);
  if (!tenant) {
    return NextResponse.json({ error: "Invalid or missing site token" }, { status: 401 });
  }

  const apiKey = (process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured" }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart form data with an audio file" },
      { status: 422 },
    );
  }

  const audio = form.get("audio");
  if (!audio || typeof audio === "string") {
    return NextResponse.json({ error: "audio file is required" }, { status: 422 });
  }
  if (audio.size <= 0) {
    return NextResponse.json({ error: "audio file is empty" }, { status: 422 });
  }
  if (audio.size > MAX_BYTES) {
    return NextResponse.json({ error: "audio file is too large" }, { status: 413 });
  }

  const filename = "name" in audio && audio.name ? audio.name : "mike-voice.webm";
  const model = (process.env.OPENAI_TRANSCRIBE_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  const upstream = new FormData();
  upstream.append("file", audio, filename);
  upstream.append("model", model);
  upstream.append("prompt", process.env.OPENAI_TRANSCRIBE_PROMPT || DEFAULT_PROMPT);
  appendLanguage(upstream, model, (process.env.OPENAI_TRANSCRIBE_LANGUAGE || "en").trim());
  for (const keyword of ["sign-in", "invite", "refund", "billing", "password", "Agent Mike"]) {
    upstream.append("keywords[]", keyword);
  }

  const transcribe = (body: FormData) =>
    fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body,
    });

  let response = await transcribe(upstream);
  if (!response.ok) {
    const detail = await response.text();
    console.warn("[transcribe] OpenAI failed", response.status, model, detail.slice(0, 400));
    if (response.status === 400 && detail.includes("Unknown parameter")) {
      const retry = new FormData();
      retry.append("file", audio, filename);
      retry.append("model", model);
      retry.append("prompt", process.env.OPENAI_TRANSCRIBE_PROMPT || DEFAULT_PROMPT);
      response = await transcribe(retry);
    }
  }

  if (!response.ok) {
    console.warn("[transcribe] retry failed", response.status, (await response.text()).slice(0, 400));
    return NextResponse.json({ error: "Transcription failed" }, { status: 502 });
  }

  const payload = (await response.json()) as { text?: string };
  return NextResponse.json({ text: (payload.text || "").trim(), model });
}
