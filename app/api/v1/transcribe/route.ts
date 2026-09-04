import { NextRequest } from "next/server";
import { json, withTenant } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 25 * 1024 * 1024;

/** OpenAI Whisper transcription for chat / widget voice input. */
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
      const upstream = new FormData();
      upstream.append("file", audio, filename);
      upstream.append("model", process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1");

      const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: upstream,
      });
      if (!response.ok) {
        const detail = await response.text();
        console.warn("[transcribe] OpenAI failed", response.status, detail.slice(0, 400));
        return json({ error: "Transcription failed" }, 502);
      }

      const payload = (await response.json()) as { text?: string };
      return json({ text: (payload.text || "").trim() });
    },
    "widget",
  );
}
