"use client";

import AutoGrowTextarea from "@/components/aix/AutoGrowTextarea";
import Button from "@/components/ui/button/Button";
import { AlertIcon, CheckLineIcon, CopyIcon, DocsIcon } from "@/icons";
import { apiFetch, WorkerApiError } from "@/lib/worker-api";
import { useEffect, useRef, useState } from "react";

const REPLY_MAX_LENGTH = 4000;

type Suggestion = { body: string; sources: string[]; needsCheck: boolean };

/** Drafts already written, by conversation and its newest message, so coming back to a conversation does not ask the model again. */
const drafts = new Map<string, Suggestion>();

/**
 * A reply the model wrote for the customer's latest message, shown to the manager before anything is sent. It can be
 * edited in place, sent in one click, or copied. It never sends by itself, and it says when no help article covered the
 * question so the manager knows to check it. Used in the Inbox and on the ticket page.
 */
export default function SuggestedReplyCard({
  conversationId,
  lastMessageKey,
  autoStart = false,
  sending = false,
  onSend,
}: {
  conversationId: string;
  /** The id of the conversation's newest message: a draft is for that message, and goes stale when a newer one arrives. */
  lastMessageKey: string;
  /** Write a draft as soon as the conversation opens (a conversation waiting for a person). */
  autoStart?: boolean;
  sending?: boolean;
  /** Sends the (edited) text to the customer. The card closes when this resolves. */
  onSend: (text: string) => Promise<void>;
}) {
  const key = `${conversationId}:${lastMessageKey}`;
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">(() => (drafts.has(key) ? "ready" : "idle"));
  const [text, setText] = useState(() => drafts.get(key)?.body ?? "");
  const [meta, setMeta] = useState<Pick<Suggestion, "sources" | "needsCheck">>(() => {
    const known = drafts.get(key);
    return { sources: known?.sources ?? [], needsCheck: known?.needsCheck ?? false };
  });
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  // What the last request was for, so a slow answer for a conversation the manager has left is dropped.
  const requestRef = useRef("");

  async function write() {
    requestRef.current = key;
    setState("loading");
    setError("");
    try {
      const result = await apiFetch<Suggestion>(`/conversations/${conversationId}/suggested-reply`, { method: "POST" });
      if (requestRef.current !== key) return;
      drafts.set(key, result);
      setText(result.body);
      setMeta({ sources: result.sources, needsCheck: result.needsCheck });
      setState("ready");
    } catch (failure) {
      if (requestRef.current !== key) return;
      setError(failure instanceof WorkerApiError ? failure.message : "Could not write a suggestion. Try again.");
      setState("error");
    }
  }

  // A different conversation, or a newer message in this one, is a different draft.
  useEffect(() => {
    const known = drafts.get(key);
    requestRef.current = "";
    setCopied(false);
    setError("");
    if (known) {
      setText(known.body);
      setMeta({ sources: known.sources, needsCheck: known.needsCheck });
      setState("ready");
      return;
    }
    setText("");
    setMeta({ sources: [], needsCheck: false });
    setState("idle");
    if (autoStart) void write();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Could not copy. Select the text and copy it.");
    }
  }

  async function send() {
    const body = text.trim();
    if (!body) return;
    try {
      await onSend(body);
      drafts.delete(key);
      setState("idle");
      setText("");
    } catch {
      // The caller says why it failed; the draft stays so nothing typed is lost.
    }
  }

  if (state === "idle" || state === "error") {
    return (
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-dashed border-gray-300 px-3.5 py-2 text-sm dark:border-white/[0.12]">
        <span className="text-gray-600 dark:text-gray-300">
          {state === "error" ? <span className="text-warning-700 dark:text-warning-400">{error}</span> : "Want a draft to start from?"}
        </span>
        <Button size="sm" variant="outline" onClick={() => void write()}>
          {state === "error" ? "Try again" : "Suggest a reply"}
        </Button>
      </div>
    );
  }

  if (state === "loading") {
    return (
      <div role="status" aria-live="polite" className="mb-2 flex items-center gap-2 rounded-2xl border border-gray-200 px-3.5 py-3 text-sm text-gray-500 dark:border-white/[0.08] dark:text-gray-400">
        <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
        Writing a suggested reply from the help articles…
      </div>
    );
  }

  return (
    <section aria-label="Suggested reply" className="mb-2 rounded-2xl border border-gray-200 bg-white dark:border-white/[0.12] dark:bg-white/[0.03]">
      <div className="flex flex-wrap items-center gap-2 px-3.5 pt-2.5">
        <p className="text-xs font-semibold text-gray-900 dark:text-white/90">Suggested reply</p>
        {meta.needsCheck ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-warning-50 px-2 py-0.5 text-theme-xs font-medium text-warning-700 dark:bg-warning-500/15 dark:text-warning-400">
            <AlertIcon className="size-3" />
            No article covered this. Check before sending.
          </span>
        ) : (
          meta.sources.map((source) => (
            <span key={source} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-theme-xs font-medium text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
              <DocsIcon className="size-3" />
              {source}
            </span>
          ))
        )}
      </div>
      <AutoGrowTextarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        minRows={3}
        maxRows={10}
        maxLength={REPLY_MAX_LENGTH}
        aria-label="Suggested reply text"
        className="block w-full resize-none bg-transparent px-3.5 py-2 text-sm leading-6 text-gray-800 outline-none dark:text-white/90"
      />
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 px-2.5 py-2 dark:border-white/[0.08]">
        <span className="pl-1 text-xs text-gray-500 dark:text-gray-400">You can edit this. Nothing is sent until you press Send.</span>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => void copy()}>
            {copied ? <CheckLineIcon className="size-4" /> : <CopyIcon className="size-4" />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button size="sm" variant="outline" disabled={sending} onClick={() => void write()}>
            Rewrite
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={sending}
            onClick={() => {
              drafts.delete(key);
              setState("idle");
              setText("");
            }}
          >
            Dismiss
          </Button>
          <Button size="sm" loading={sending} disabled={!text.trim()} onClick={() => void send()}>
            Send to customer
          </Button>
        </div>
      </div>
    </section>
  );
}
