"use client";

import { createContext, useContext, useEffect, useState, type FormEvent } from "react";
import type { ChoicesCard, HelpdeskTicketCard, IdentityRequestCard } from "@/lib/customer-cards";
import { saveRemembered } from "@/lib/remembered-customer";
import { submitIdentity, verifyIdentityCode, WorkerApiError } from "@/lib/worker-api";

/**
 * What a card in a customer reply can do in the chat panel: quick replies
 * send their text as the customer's next message, and only the newest
 * reply's ones can still be tapped.
 */
/** What the visitor has told the chat about themselves so far. */
export type ChatIdentity = { name?: string; email?: string; verified?: boolean };

export type CustomerCardsContextValue = {
  busy: boolean;
  onReply: (text: string) => void;
  /** The conversation the cards belong to, once the first reply has created it. */
  conversationId?: string;
  /** The public widget's site token; absent in the Playground. */
  siteToken?: string;
  identity?: ChatIdentity;
  onIdentity?: (identity: ChatIdentity) => void;
};

export const CustomerCardsContext = createContext<CustomerCardsContextValue>({ busy: false, onReply: () => undefined });

/** Whether the card belongs to the newest reply. Set per message by the panel. */
export const LatestReplyContext = createContext(false);

export function ChoicesView({ data }: { data: ChoicesCard }) {
  const { busy, onReply } = useContext(CustomerCardsContext);
  const latest = useContext(LatestReplyContext);
  // Older questions have been answered; their buttons would only confuse.
  if (!latest || !data.options?.length) return null;
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Quick replies">
      {data.options.map((option) => (
        <button
          key={option}
          type="button"
          disabled={busy}
          onClick={() => onReply(option)}
          className="rounded-lg border border-brand-200 bg-white px-3 py-1.5 text-xs font-medium text-brand-600 transition-colors hover:border-brand-400 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-brand-500/30 dark:bg-white/[0.03] dark:text-brand-300 dark:hover:bg-brand-500/10"
        >
          {option}
        </button>
      ))}
    </div>
  );
}

export function HelpdeskTicketView({ data }: { data: HelpdeskTicketCard }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-left dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {data.created ? "Ticket raised" : "Added to your ticket"}
        </span>
        <span className="rounded-md bg-brand-50 px-2 py-0.5 font-mono text-xs font-semibold text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
          {data.key}
        </span>
      </div>
      {data.title && <p className="mt-1.5 text-sm font-medium leading-5 text-gray-800 dark:text-white/90">{data.title}</p>}
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        {[data.requestType, "A teammate will follow up"].filter(Boolean).join(" · ")}
      </p>
    </div>
  );
}

const inputClass =
  "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 outline-none transition-colors placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";
const primaryButtonClass =
  "h-10 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-300";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Counts a number of seconds down to zero, once a second. */
function useCountdown(): [number, (seconds: number) => void] {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (left <= 0) return;
    const timer = setTimeout(() => setLeft((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [left]);
  return [left, setLeft];
}

/**
 * The card that asks a visitor for their name and email (and, when the worker
 * is set to verify, the 6-digit code emailed to them). The server decides which
 * steps apply; this only shows what it answers. Once the visitor is done the
 * form gives way to a one-line confirmation and the chat carries on.
 */
export function IdentityRequestView({ data }: { data: IdentityRequestCard }) {
  const { busy, onReply, conversationId, siteToken, identity, onIdentity } = useContext(CustomerCardsContext);
  const latest = useContext(LatestReplyContext);
  const [name, setName] = useState(data.name ?? identity?.name ?? "");
  const [email, setEmail] = useState(data.email ?? identity?.email ?? "");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"form" | "code" | "done">("form");
  const [errors, setErrors] = useState<{ name?: string; email?: string; code?: string; form?: string }>({});
  const [working, setWorking] = useState(false);
  const [resendIn, setResendIn] = useCountdown();

  const known = Boolean(identity?.email && (data.mode === "email_match" || identity.verified));
  if (stage === "done" || known) {
    const who = identity?.name || name;
    return (
      <p className="rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-xs text-gray-600 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-300">
        {identity?.verified ? "Email verified" : "Details shared"}
        {who ? `: ${who}` : ""}
        {identity?.email ? ` (${identity.email})` : ""}
      </p>
    );
  }
  // Older questions have been answered; their forms would only confuse.
  if (!latest) return null;

  function fail(error: unknown, where: "form" | "code") {
    if (error instanceof WorkerApiError) {
      if (error.status === 429) {
        if (error.retryAfter) setResendIn(error.retryAfter);
        setErrors({ [where]: `Too many tries. Wait ${error.retryAfter ?? 60} seconds and try again.` });
        return;
      }
      if (error.status === 410) {
        setErrors({ code: "That code has expired. Send a new one." });
        setResendIn(0);
        return;
      }
      if (error.status === 422) {
        if (where === "code") {
          const left = error.attemptsLeft;
          setErrors({
            code: left === undefined ? error.message : `That code is not right. ${left} ${left === 1 ? "try" : "tries"} left.`,
          });
        } else {
          setErrors({ ...(error.errors ?? {}), ...(error.errors ? {} : { form: error.message }) });
        }
        return;
      }
    }
    setErrors({ [where]: "Could not do that just now. Please try again." });
  }

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const next: typeof errors = {};
    const cleanName = name.trim();
    if (cleanName.length < 2 || cleanName.length > 80) next.name = "Enter your name (2 to 80 characters).";
    if (!EMAIL_PATTERN.test(email.trim())) next.email = "Enter a valid email address.";
    if (!conversationId) next.form = "Send your message first, then share your details.";
    setErrors(next);
    if (Object.keys(next).length > 0 || !conversationId) return;
    setWorking(true);
    try {
      const result = await submitIdentity({ conversationId, name: cleanName, email: email.trim() }, siteToken);
      onIdentity?.({ name: cleanName, email: email.trim(), verified: false });
      if (result.next === "code") {
        setStage("code");
        setResendIn(result.resend_in);
        setCode("");
      } else {
        setStage("done");
        onReply("I've shared my details.");
      }
    } catch (error) {
      fail(error, "form");
    } finally {
      setWorking(false);
    }
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setErrors({ code: "Enter the 6-digit code from your email." });
      return;
    }
    if (!conversationId) return;
    setErrors({});
    setWorking(true);
    try {
      const verified = await verifyIdentityCode({ conversationId, code }, siteToken);
      if (verified.remember_token) saveRemembered(siteToken, { token: verified.remember_token, name: verified.name ?? name.trim(), email: email.trim() });
      onIdentity?.({ name: name.trim(), email: email.trim(), verified: true });
      setStage("done");
      onReply("I've verified my email.");
    } catch (error) {
      fail(error, "code");
    } finally {
      setWorking(false);
    }
  }

  const disabled = busy || working;

  if (stage === "code") {
    return (
      <form
        onSubmit={verify}
        className="rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-left dark:border-gray-800 dark:bg-white/[0.03]"
      >
        <p className="text-sm font-medium text-gray-800 dark:text-white/90">Check your email</p>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">We sent a 6-digit code to {email.trim()}.</p>
        <label className="mt-3 block text-xs font-medium text-gray-700 dark:text-gray-300">
          Code
          <input
            value={code}
            onChange={(event) => {
              setCode(event.target.value.replace(/\D/g, "").slice(0, 6));
              setErrors((current) => ({ ...current, code: undefined }));
            }}
            onPaste={(event) => {
              event.preventDefault();
              setCode(event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6));
            }}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            placeholder="123456"
            aria-invalid={Boolean(errors.code)}
            aria-describedby={errors.code ? "identity-code-error" : undefined}
            disabled={disabled}
            className={`${inputClass} mt-1 text-center font-mono text-base tracking-[0.4em]`}
          />
        </label>
        {errors.code && (
          <p id="identity-code-error" role="alert" className="mt-1.5 text-xs font-medium text-error-600 dark:text-error-400">
            {errors.code}
          </p>
        )}
        <div className="mt-3 flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={disabled || resendIn > 0}
            onClick={() => void send()}
            className="text-xs font-medium text-brand-600 hover:underline disabled:cursor-not-allowed disabled:text-gray-400 disabled:no-underline dark:text-brand-300"
          >
            {resendIn > 0 ? `Resend in ${resendIn}s` : "Send a new code"}
          </button>
          <button type="submit" disabled={disabled || code.length !== 6} className={primaryButtonClass}>
            Verify
          </button>
        </div>
      </form>
    );
  }

  return (
    <form
      onSubmit={send}
      noValidate
      className="rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-left dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <p className="text-sm font-medium text-gray-800 dark:text-white/90">Who am I speaking with?</p>
      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
        {data.mode === "email_code"
          ? "I will email you a 6-digit code to confirm your address."
          : "So the team knows who to reply to."}
      </p>
      <label className="mt-3 block text-xs font-medium text-gray-700 dark:text-gray-300">
        Name
        <input
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setErrors((current) => ({ ...current, name: undefined, form: undefined }));
          }}
          autoComplete="name"
          maxLength={80}
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? "identity-name-error" : undefined}
          disabled={disabled}
          className={`${inputClass} mt-1`}
        />
      </label>
      {errors.name && (
        <p id="identity-name-error" role="alert" className="mt-1 text-xs font-medium text-error-600 dark:text-error-400">
          {errors.name}
        </p>
      )}
      <label className="mt-2.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
        Email
        <input
          type="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setErrors((current) => ({ ...current, email: undefined, form: undefined }));
          }}
          autoComplete="email"
          inputMode="email"
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? "identity-email-error" : undefined}
          disabled={disabled}
          className={`${inputClass} mt-1`}
        />
      </label>
      {errors.email && (
        <p id="identity-email-error" role="alert" className="mt-1 text-xs font-medium text-error-600 dark:text-error-400">
          {errors.email}
        </p>
      )}
      {errors.form && (
        <p role="alert" className="mt-2 text-xs font-medium text-error-600 dark:text-error-400">
          {errors.form}
        </p>
      )}
      <div className="mt-3 flex justify-end">
        <button type="submit" disabled={disabled} className={primaryButtonClass}>
          {data.mode === "email_code" ? "Send code" : "Continue"}
        </button>
      </div>
    </form>
  );
}

export function CardSkeleton() {
  return <div className="h-10 animate-pulse rounded-xl bg-gray-100 dark:bg-white/5" />;
}
