"use client";
import { useEffect, useRef, useState } from "react";

// Minimal Web Speech API surface — not in the default TS DOM lib.
interface SpeechRecognitionErrorLike {
  error: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}

function getSpeechRecognition(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  const Ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as
    | (new () => SpeechRecognitionLike)
    | undefined;
  return Ctor ? new Ctor() : null;
}

/** The mic just didn't catch anything, or the user cancelled — not worth surfacing as an error. */
const SILENT_ERRORS = new Set(["no-speech", "aborted"]);

export function useVoiceInput(onTranscript: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onTranscriptRef = useRef(onTranscript);

  // Keeps the latest callback without making `toggle` (and the recognition
  // instance it creates) depend on identity churn from the caller.
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  });

  useEffect(() => {
    setSupported(getSpeechRecognition() !== null);
    return () => recognitionRef.current?.stop();
  }, []);

  const toggle = () => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    setError(null);
    const recognition = getSpeechRecognition();
    if (!recognition) return;
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript;
      }
      if (finalText) onTranscriptRef.current(finalText.trim());
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = (event) => {
      setListening(false);
      if (SILENT_ERRORS.has(event.error)) return;
      setError(
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "Microphone access blocked. Allow it in your browser settings, then try again."
          : "Voice input failed. Try again.",
      );
    };
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  };

  return { listening, supported, toggle, error };
}
