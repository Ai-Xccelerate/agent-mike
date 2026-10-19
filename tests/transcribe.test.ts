import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/v1/transcribe/route";
import { checkRateLimit, clientIp, resetRateLimits } from "@/lib/rate-limit";
import { getIdentityAdapter, setIdentityAdapter } from "@/lib/identity";
import {
  TRANSCRIBE_MAX_BYTES,
  TranscriptionError,
  WIDGET_LIMITS,
  WIDGET_MAX_BYTES,
  transcribeAudio,
  transcriptionModel,
} from "@/lib/transcription";

const previousAdapter = getIdentityAdapter();
const fetchMock = vi.fn();
let role: "owner" | "member" = "owner";
const savedEnv = { key: process.env.OPENAI_API_KEY, demo: process.env.DEMO_MODE, model: process.env.TRANSCRIPTION_MODEL };

function audioRequest(parts: Record<string, Blob | string>, headers: Record<string, string> = {}) {
  const form = new FormData();
  for (const [name, value] of Object.entries(parts)) form.append(name, value);
  return new NextRequest("http://localhost/api/v1/transcribe", { method: "POST", body: form, headers });
}

const clip = () => ({ audio: new Blob(["bytes"], { type: "audio/webm" }) });
const widget = (ip = "203.0.113.7") => ({ "x-worker-site-token": "site-ok", "x-real-ip": ip });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  process.env.OPENAI_API_KEY = "sk-test";
  delete process.env.DEMO_MODE;
  delete process.env.TRANSCRIPTION_MODEL;
  role = "owner";
  setIdentityAdapter({
    resolveManagerRequest: async () => ({ orgId: "org-x", userId: "manager", role, source: "test" }),
    resolveWidgetRequest: async (req) =>
      req.headers.get("x-worker-site-token") === "site-ok" ? { orgId: "org-x", userId: "widget", role: "member", source: "widget" } : null,
  });
  resetRateLimits();
});

afterEach(() => {
  setIdentityAdapter(previousAdapter);
  vi.unstubAllGlobals();
  for (const [name, value] of [["OPENAI_API_KEY", savedEnv.key], ["DEMO_MODE", savedEnv.demo], ["TRANSCRIPTION_MODEL", savedEnv.model]] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("transcribeAudio", () => {
  it("sends the audio to OpenAI with the configured model and returns the trimmed text", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ text: "  show the latest tickets  " }), { status: 200 }));
    const text = await transcribeAudio(Buffer.from("audio"), "audio/webm;codecs=opus");
    expect(text).toBe("show the latest tickets");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/audio/transcriptions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
    const form = init.body as FormData;
    expect(form.get("model")).toBe("gpt-4o-transcribe");
    expect((form.get("file") as File).name).toBe("dictation.webm");
  });

  it("uses the model named in TRANSCRIPTION_MODEL, and a name that fits Safari's mp4", async () => {
    process.env.TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";
    expect(transcriptionModel()).toBe("gpt-4o-mini-transcribe");
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ text: "hi" }), { status: 200 }));
    await transcribeAudio(Buffer.from("audio"), "audio/mp4");
    expect(((fetchMock.mock.calls[0][1].body as FormData).get("file") as File).name).toBe("dictation.m4a");
  });

  it("is unavailable without a key or in demo mode, and never calls OpenAI", async () => {
    delete process.env.OPENAI_API_KEY;
    await expect(transcribeAudio(Buffer.from("a"), "audio/webm")).rejects.toMatchObject({ kind: "unavailable" });
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.DEMO_MODE = "true";
    await expect(transcribeAudio(Buffer.from("a"), "audio/webm")).rejects.toMatchObject({ kind: "unavailable" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects empty and oversized recordings before calling OpenAI", async () => {
    await expect(transcribeAudio(Buffer.alloc(0), "audio/webm")).rejects.toMatchObject({ kind: "rejected" });
    await expect(transcribeAudio(Buffer.alloc(TRANSCRIBE_MAX_BYTES + 1), "audio/webm")).rejects.toMatchObject({ kind: "rejected" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps OpenAI's refusals without passing its message on", async () => {
    fetchMock.mockResolvedValueOnce(new Response("secret detail", { status: 400 }));
    const bad = await transcribeAudio(Buffer.from("a"), "audio/webm").catch((e: unknown) => e);
    expect(bad).toBeInstanceOf(TranscriptionError);
    expect((bad as TranscriptionError).kind).toBe("rejected");
    expect((bad as TranscriptionError).message).not.toContain("secret");

    fetchMock.mockResolvedValueOnce(new Response("down", { status: 503 }));
    await expect(transcribeAudio(Buffer.from("a"), "audio/webm")).rejects.toMatchObject({ kind: "failed" });

    fetchMock.mockRejectedValueOnce(new Error("network"));
    await expect(transcribeAudio(Buffer.from("a"), "audio/webm")).rejects.toMatchObject({ kind: "failed" });
  });
});

describe("POST /api/v1/transcribe", () => {
  it("returns the transcript for a manager", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ text: "open the inbox" }), { status: 200 }));
    const res = await POST(audioRequest({ audio: new Blob(["bytes"], { type: "audio/webm" }) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: "open the inbox" });
  });

  it("refuses a non-admin and spends nothing", async () => {
    role = "member";
    const res = await POST(audioRequest({ audio: new Blob(["bytes"], { type: "audio/webm" }) }));
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks for audio when none is sent", async () => {
    expect((await POST(audioRequest({ note: "no audio" }))).status).toBe(400);
  });

  it("answers 503 when voice isn't set up, and 502 when OpenAI fails", async () => {
    delete process.env.OPENAI_API_KEY;
    expect((await POST(audioRequest({ audio: new Blob(["b"], { type: "audio/webm" }) }))).status).toBe(503);
    process.env.OPENAI_API_KEY = "sk-test";
    fetchMock.mockResolvedValue(new Response("down", { status: 500 }));
    expect((await POST(audioRequest({ audio: new Blob(["b"], { type: "audio/webm" }) }))).status).toBe(502);
  });
});

describe("POST /api/v1/transcribe from the website widget", () => {
  beforeEach(() => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ text: "hello" }), { status: 200 }));
  });

  it("transcribes for a valid site token", async () => {
    const res = await POST(audioRequest(clip(), widget()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: "hello" });
  });

  it("refuses an unknown site token and spends nothing", async () => {
    const res = await POST(audioRequest(clip(), { "x-worker-site-token": "nope" }));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("takes only short recordings", async () => {
    const big = new Blob([new Uint8Array(WIDGET_MAX_BYTES + 1)], { type: "audio/webm" });
    const res = await POST(audioRequest({ audio: big }, widget()));
    expect(res.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("limits one address, then lets it back in when it is another address", async () => {
    for (let i = 0; i < WIDGET_LIMITS.perIp.limit; i++) expect((await POST(audioRequest(clip(), widget("198.51.100.1")))).status).toBe(200);
    const blocked = await POST(audioRequest(clip(), widget("198.51.100.1")));
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect((await POST(audioRequest(clip(), widget("198.51.100.2")))).status).toBe(200);
  });

  it("caps a whole site even when every request comes from a new address", async () => {
    for (let i = 0; i < WIDGET_LIMITS.perSite.limit; i++) expect((await POST(audioRequest(clip(), widget(`10.0.${Math.floor(i / 250)}.${i % 250}`)))).status).toBe(200);
    expect((await POST(audioRequest(clip(), widget("10.9.9.9")))).status).toBe(429);
  });

  it("does not rate limit a signed-in manager", async () => {
    for (let i = 0; i < WIDGET_LIMITS.perIp.limit + 5; i++) expect((await POST(audioRequest(clip()))).status).toBe(200);
  });
});

describe("checkRateLimit", () => {
  beforeEach(() => resetRateLimits());

  it("slides: a hit is allowed again once the oldest one ages out, with no burst at a window edge", () => {
    expect(checkRateLimit("k", 2, 1000, 0)).toEqual({ allowed: true });
    expect(checkRateLimit("k", 2, 1000, 600)).toEqual({ allowed: true });
    expect(checkRateLimit("k", 2, 1000, 900)).toEqual({ allowed: false, retryAfterSeconds: 1 });
    // The first hit (t=0) has aged out at t=1001, the second (t=600) has not.
    expect(checkRateLimit("k", 2, 1000, 1001)).toEqual({ allowed: true });
    expect(checkRateLimit("k", 2, 1000, 1100)).toEqual({ allowed: false, retryAfterSeconds: 1 });
  });

  it("keeps separate keys apart", () => {
    expect(checkRateLimit("a", 1, 1000, 0).allowed).toBe(true);
    expect(checkRateLimit("a", 1, 1000, 1).allowed).toBe(false);
    expect(checkRateLimit("b", 1, 1000, 1).allowed).toBe(true);
  });
});

describe("clientIp", () => {
  it("prefers x-real-ip, then the last forwarded address, never the first", () => {
    expect(clientIp(new Headers({ "x-real-ip": "1.1.1.1", "x-forwarded-for": "9.9.9.9, 2.2.2.2" }))).toBe("1.1.1.1");
    expect(clientIp(new Headers({ "x-forwarded-for": "9.9.9.9, 2.2.2.2" }))).toBe("2.2.2.2");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
