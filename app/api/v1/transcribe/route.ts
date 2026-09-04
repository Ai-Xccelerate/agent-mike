import { NextRequest } from "next/server";
import { json, withTenant } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 25 * 1024 * 1024;
/** OpenAI’s recommended file transcription model (replaces whisper-1). */
const DEFAULT_MODEL = "gpt-transcribe";
const DEFAULT_PROMPT =
  "Customer dictating a product-support question to Agent Mike. Prefer clear English for setup, sign-in, invites, billing, and account issues. Ignore background noise; do not invent filler phrases.";

function appendLanguages(upstream: FormData, model: string, language: string) {
  if (!language) return;
  // gpt-transcribe uses languages[]; whisper-1 / older 4o models use language.
  if (model === "whisper-1" || model.includes("4o-transcribe")) {
    upstream.append("language", language);
    return;
  }
  upstream.append("languages[]", language);
}

/** OpenAI speech-to-text for chat / widget voice input. */
export async function POST(req: NextRequest) {
  return withTenant(
    req,
    async () => {
      const apiKey = (process.env.OPENAI_API_KEY || "").trim();
      if (!apiKey) {
        return json({ error: "OPENAI_API_KEY is not configured" }, 503);
      }

      let form: FormData;
      try {
        form = await req.formData();
      } catch {
        return json({ error: "Expected multipart form data with an audio file" }, 422);
      }

      const audio = form.get("audio");
      if (!audio || typeof audio === "string") {
        return json({ error: "audio file is required" }, 422);
      }
      if (audio.size <= 0) return json({ error: "audio file is empty" }, 422);
      if (audio.size > MAX_BYTES) return json({ error: "audio file is too large" }, 413);

      const filename = "name" in audio && audio.name ? audio.name : "mike-voice.webm";
      const model = (process.env.OPENAI_TRANSCRIBE_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
      const upstream = new FormData();
      upstream.append("file", audio, filename);
      upstream.append("model", model);
      upstream.append("prompt", process.env.OPENAI_TRANSCRIBE_PROMPT || DEFAULT_PROMPT);
      appendLanguages(upstream, model, (process.env.OPENAI_TRANSCRIBE_LANGUAGE || "en").trim());
      for (const keyword of ["sign-in", "invite", "refund", "billing", "password", "Agent Mike"]) {
        upstream.append("keywords[]", keyword);
      }

      const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: upstream,
      });
      if (!response.ok) {
        const detail = await response.text();
        console.warn("[transcribe] OpenAI failed", response.status, model, detail.slice(0, 400));
        // Retry once without keywords/languages if the model rejects those fields.
        if (response.status === 400 && detail.includes("Unknown parameter")) {
          const retry = new FormData();
          retry.append("file", audio, filename);
          retry.append("model", model);
          retry.append("prompt", process.env.OPENAI_TRANSCRIBE_PROMPT || DEFAULT_PROMPT);
          const second = await fetch("https://api.openai.com/v1/audio/transcriptions", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}` },
            body: retry,
          });
          if (second.ok) {
            const payload = (await second.json()) as { text?: string };
            return json({ text: (payload.text || "").trim(), model });
          }
          console.warn("[transcribe] retry failed", second.status, (await second.text()).slice(0, 400));
        }
        return json({ error: "Transcription failed" }, 502);
      }

      const payload = (await response.json()) as { text?: string };
      return json({ text: (payload.text || "").trim(), model });
    },
    "widget",
  );
}
