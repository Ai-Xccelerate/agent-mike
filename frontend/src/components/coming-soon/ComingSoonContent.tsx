"use client";
import React, { useEffect, useState } from "react";

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

const pad = (n: number) => String(Math.max(0, n)).padStart(2, "0");

function diffToTimeLeft(target: number): TimeLeft {
  const total = Math.max(0, target - Date.now());
  return {
    days: Math.floor(total / (1000 * 60 * 60 * 24)),
    hours: Math.floor(total / (1000 * 60 * 60)) % 24,
    minutes: Math.floor(total / (1000 * 60)) % 60,
    seconds: Math.floor(total / 1000) % 60,
  };
}

export default function ComingSoonContent() {
  const [targetDate, setTargetDate] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(null);
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    const target = Date.now() + 30 * 24 * 60 * 60 * 1000;
    setTargetDate(target);
    setTimeLeft(diffToTimeLeft(target));
  }, []);

  useEffect(() => {
    if (targetDate === null) return;
    const timer = setInterval(() => {
      setTimeLeft(diffToTimeLeft(targetDate));
    }, 1000);
    return () => clearInterval(timer);
  }, [targetDate]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (email.trim()) {
      setSubscribed(true);
    }
  };

  const units: Array<{ label: string; value: number | null }> = [
    { label: "Days", value: timeLeft?.days ?? null },
    { label: "Hours", value: timeLeft?.hours ?? null },
    { label: "Minutes", value: timeLeft?.minutes ?? null },
    { label: "Seconds", value: timeLeft?.seconds ?? null },
  ];

  return (
    <div className="mx-auto w-full max-w-[300px] text-center sm:max-w-[520px]">
      <h1
        className="mb-3 text-2xl font-bold tracking-tight text-gray-800 dark:text-white/90 sm:text-3xl"
        data-aix-id="AIX-503.1"
      >
        Something new is coming
      </h1>

      <p className="mb-8 text-base text-gray-700 dark:text-gray-400 sm:text-lg">
        We&apos;re putting the finishing touches on the next addition to your
        AI workforce.
      </p>

      <div
        className="mb-10 grid grid-cols-4 gap-2 sm:gap-4"
        data-aix-id="AIX-503.2"
      >
        {units.map((unit) => (
          <div
            key={unit.label}
            className="rounded-2xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-white/[0.03] sm:p-5"
          >
            <p className="text-2xl font-bold tracking-tight text-gray-800 tabular-nums dark:text-white/90 sm:text-3xl">
              {unit.value === null ? "--" : pad(unit.value)}
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 sm:text-sm">
              {unit.label}
            </p>
          </div>
        ))}
      </div>

      <div data-aix-id="AIX-503.3">
        {subscribed ? (
          <p className="text-sm text-gray-700 dark:text-gray-400 sm:text-base">
            You&apos;re on the list — we&apos;ll email{" "}
            <span className="font-medium text-gray-800 dark:text-white/90">
              {email}
            </span>{" "}
            the moment it launches.
          </p>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="mx-auto flex w-full max-w-md flex-col gap-3 sm:flex-row"
          >
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              aria-label="Email address"
              className="h-11 w-full flex-1 rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
            />
            <button
              type="submit"
              className="inline-flex h-11 items-center justify-center rounded-lg bg-brand-500 px-5 text-sm font-medium text-white shadow-theme-xs transition-colors duration-150 hover:bg-brand-600"
            >
              Notify me
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
