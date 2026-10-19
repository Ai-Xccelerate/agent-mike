"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { transcribeRecording } from "@/lib/worker-api";

/** Longest recording for a signed-in manager. The server takes up to 10 MB, far more than this. */
const MAX_RECORDING_MS = 120_000;
/** The public widget takes short messages only (the server allows 2 MB). */
const WIDGET_MAX_RECORDING_MS = 30_000;

export type DictationOptions = {
  /** Set in the website widget: the recording is sent with this token and kept short. */
  siteToken?: string;
};

const noSubscription = () => () => undefined;
const canRecord = () =>
  typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined";

export type DictationState = "idle" | "recording" | "transcribing";

/** The first container this browser can record, in the order OpenAI handles best. */
function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((type) =>
    MediaRecorder.isTypeSupported(type),
  );
}

/**
 * Dictation for the admin Assistant: records from the microphone, then sends
 * the audio to the server, which transcribes it with OpenAI. Unlike the
 * browser's own speech recognition, this works in any browser that can
 * record, and says why when it fails.
 */
export function useDictation(onTranscript: (text: string) => void, options: DictationOptions = {}) {
  const [state, setState] = useState<DictationState>("idle");
  // True on the server so the first render matches; the browser answer follows.
  const supported = useSyncExternalStore(noSubscription, canRecord, () => true);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);
  const onTranscriptRef = useRef(onTranscript);
  const siteTokenRef = useRef(options.siteToken);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
    siteTokenRef.current = options.siteToken;
  });

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const releaseMic = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const start = async () => {
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (caught) {
      const name = caught instanceof DOMException ? caught.name : "";
      setError(
        name === "NotAllowedError" || name === "SecurityError"
          ? "Microphone access blocked. Allow it in your browser settings, then try again."
          : name === "NotFoundError" || name === "OverconstrainedError"
            ? "No microphone found. Check your input device and try again."
            : "Couldn't start the microphone. Try again.",
      );
      return;
    }
    streamRef.current = stream;
    cancelledRef.current = false;
    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = async () => {
      releaseMic();
      if (cancelledRef.current) return;
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
      if (blob.size === 0) {
        setState("idle");
        setError("Didn't catch any audio. Check your microphone and try again.");
        return;
      }
      setState("transcribing");
      try {
        const text = await transcribeRecording(blob, siteTokenRef.current?.trim() || undefined);
        if (cancelledRef.current) return;
        if (text) onTranscriptRef.current(text);
        else setError("Didn't catch any words. Try again a little closer to the microphone.");
      } catch (caught) {
        if (!cancelledRef.current) setError(caught instanceof Error && caught.message ? caught.message : "Voice input failed. Try again.");
      } finally {
        if (!cancelledRef.current) setState("idle");
      }
    };
    recorderRef.current = recorder;
    recorder.start();
    setState("recording");
    timerRef.current = setTimeout(() => {
      if (recorder.state === "recording") recorder.stop();
    }, siteTokenRef.current?.trim() ? WIDGET_MAX_RECORDING_MS : MAX_RECORDING_MS);
  };

  const toggle = () => {
    if (state === "transcribing") return;
    if (state === "recording") {
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      return;
    }
    void start();
  };

  return { state, listening: state === "recording", transcribing: state === "transcribing", supported, toggle, error };
}
