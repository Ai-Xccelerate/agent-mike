/**
 * Speech to text for the admin Assistant's mic, through OpenAI's transcription
 * API. The browser's own speech recognition sends audio to a third party we
 * don't control and is missing from several browsers; this uses the same
 * OpenAI account as the rest of the app instead.
 */

import { isDemoMode } from "@/lib/env";

export const TRANSCRIBE_MAX_BYTES = 10 * 1024 * 1024;
const TIMEOUT_MS = 30000;

export function transcriptionModel(): string {
  return (process.env.TRANSCRIPTION_MODEL || "").trim() || "gpt-4o-transcribe";
}

/** A hint for names and terms the manager is likely to say; it doesn't limit what is transcribed. */
const VOCABULARY_HINT =
  "A support manager dictating to an assistant about tickets, the Inbox, Jira, Confluence, escalations, skills and guardrails.";

export class TranscriptionError extends Error {
  constructor(
    message: string,
    readonly kind: "unavailable" | "rejected" | "failed",
  ) {
    super(message);
    this.name = "TranscriptionError";
  }
}

/** What the recorder produced, as a file extension OpenAI accepts. */
function extensionFor(mimeType: string): string {
  const type = mimeType.toLowerCase();
  if (type.includes("mp4") || type.includes("m4a") || type.includes("aac")) return "m4a";
  if (type.includes("ogg")) return "ogg";
  if (type.includes("wav")) return "wav";
  if (type.includes("mpeg") || type.includes("mp3")) return "mp3";
  return "webm";
}

export async function transcribeAudio(bytes: Buffer, mimeType: string): Promise<string> {
  const key = (process.env.OPENAI_API_KEY || "").trim();
  if (isDemoMode() || !key) throw new TranscriptionError("Voice input isn't set up on this server.", "unavailable");
  if (bytes.byteLength === 0) throw new TranscriptionError("No audio was recorded.", "rejected");
  if (bytes.byteLength > TRANSCRIBE_MAX_BYTES) {
    throw new TranscriptionError("That recording is too long. Try a shorter one.", "rejected");
  }

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)], { type: mimeType || "audio/webm" }), `dictation.${extensionFor(mimeType)}`);
  form.append("model", transcriptionModel());
  form.append("response_format", "json");
  form.append("prompt", VOCABULARY_HINT);

  const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").trim().replace(/\/+$/, "");
  let response: Response;
  try {
    response = await fetch(`${base}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new TranscriptionError("Couldn't reach the transcription service. Try again.", "failed");
  }

  if (!response.ok) {
    // OpenAI's own message can echo request details; log it, never return it.
    console.warn("[transcribe] OpenAI refused:", response.status, (await response.text().catch(() => "")).slice(0, 300));
    throw new TranscriptionError(
      response.status === 400 ? "That recording couldn't be read. Try again." : "Transcription failed. Try again.",
      response.status === 400 ? "rejected" : "failed",
    );
  }

  const data = (await response.json().catch(() => null)) as { text?: unknown } | null;
  return typeof data?.text === "string" ? data.text.trim() : "";
}
