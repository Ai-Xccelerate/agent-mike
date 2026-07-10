"use client";
import Button from "@/components/ui/button/Button";
import { ChevronLeftIcon } from "@/icons";
import Link from "next/link";
import React, { useEffect, useRef, useState } from "react";

const OTP_LENGTH = 6;
const RESEND_SECONDS = 30;

export default function OtpForm() {
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [secondsLeft]);

  const setDigit = (index: number, value: string) => {
    setDigits((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleChange = (
    index: number,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const raw = e.target.value.replace(/\D/g, "");
    if (!raw) {
      setDigit(index, "");
      return;
    }
    if (raw.length > 1) {
      // Handle paste of multiple digits
      setDigits((prev) => {
        const next = [...prev];
        raw
          .slice(0, OTP_LENGTH - index)
          .split("")
          .forEach((ch, i) => {
            next[index + i] = ch;
          });
        return next;
      });
      const focusIndex = Math.min(index + raw.length, OTP_LENGTH - 1);
      inputsRef.current[focusIndex]?.focus();
      return;
    }
    setDigit(index, raw);
    if (index < OTP_LENGTH - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
    if (e.key === "ArrowLeft" && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
    if (e.key === "ArrowRight" && index < OTP_LENGTH - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handleResend = () => {
    setDigits(Array(OTP_LENGTH).fill(""));
    setSecondsLeft(RESEND_SECONDS);
    inputsRef.current[0]?.focus();
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
  };

  const isComplete = digits.every((d) => d !== "");

  return (
    <div className="flex flex-col flex-1 lg:w-1/2 w-full" data-aix-id="AIX-453">
      <div className="w-full max-w-md sm:pt-10 mx-auto mb-5" data-aix-id="AIX-453.1">
        <Link
          href="/signin"
          className="inline-flex items-center text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
        >
          <ChevronLeftIcon />
          Back to sign in
        </Link>
      </div>
      <div
        className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto"
        data-aix-id="AIX-453.2"
      >
        <div>
          <div className="mb-5 sm:mb-8">
            <h1 className="mb-2 font-semibold text-gray-800 text-title-sm dark:text-white/90 sm:text-title-md">
              Enter verification code
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              We sent a 6-digit code to your email. Enter it below to continue.
            </p>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="space-y-6">
              <div className="flex justify-between gap-2 sm:gap-3">
                {digits.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => {
                      inputsRef.current[index] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    autoComplete={index === 0 ? "one-time-code" : "off"}
                    maxLength={OTP_LENGTH}
                    value={digit}
                    onChange={(e) => handleChange(index, e)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    onFocus={(e) => e.target.select()}
                    aria-label={`Digit ${index + 1}`}
                    className="h-12 w-full max-w-13 rounded-lg border border-gray-300 bg-transparent text-center text-lg font-semibold text-gray-800 shadow-theme-xs transition-colors duration-150 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-800 sm:h-14"
                  />
                ))}
              </div>
              <div>
                <Button className="w-full" size="sm" disabled={!isComplete}>
                  Verify and continue
                </Button>
              </div>
            </div>
          </form>
          <div className="mt-5">
            <p className="text-sm font-normal text-center text-gray-700 dark:text-gray-400 sm:text-start">
              Didn&apos;t get the code?{" "}
              {secondsLeft > 0 ? (
                <span className="text-gray-500 dark:text-gray-400">
                  Resend in {secondsLeft}s
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleResend}
                  className="text-brand-500 transition-colors hover:text-brand-600 dark:text-brand-400"
                >
                  Resend code
                </button>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
