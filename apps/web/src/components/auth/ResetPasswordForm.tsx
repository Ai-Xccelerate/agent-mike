"use client";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";
import { ChevronLeftIcon } from "@/icons";
import Link from "next/link";
import React, { useState } from "react";

export default function ResetPasswordForm() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (email.trim()) {
      setSubmitted(true);
    }
  };

  return (
    <div className="flex flex-col flex-1 lg:w-1/2 w-full" data-aix-id="AIX-452">
      <div className="w-full max-w-md sm:pt-10 mx-auto mb-5" data-aix-id="AIX-452.1">
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
        data-aix-id="AIX-452.2"
      >
        {submitted ? (
          <div>
            <div className="mb-5 flex size-12 items-center justify-center rounded-full bg-success-50 dark:bg-success-500/15">
              <svg
                className="size-6 text-success-600 dark:text-success-500"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M5 12.5L10 17.5L19 7.5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h1 className="mb-2 font-semibold text-gray-800 text-title-sm dark:text-white/90 sm:text-title-md">
              Check your email
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              We sent a reset link to{" "}
              <span className="font-medium text-gray-800 dark:text-white/90">
                {email}
              </span>
              . Follow the link to set a new password.
            </p>
            <p className="mt-5 text-sm text-gray-500 dark:text-gray-400">
              Didn&apos;t get it?{" "}
              <button
                type="button"
                onClick={() => setSubmitted(false)}
                className="text-brand-500 transition-colors hover:text-brand-600 dark:text-brand-400"
              >
                Try another email
              </button>
            </p>
          </div>
        ) : (
          <div>
            <div className="mb-5 sm:mb-8">
              <h1 className="mb-2 font-semibold text-gray-800 text-title-sm dark:text-white/90 sm:text-title-md">
                Forgot your password?
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Enter the email linked to your account and we&apos;ll send you a
                link to reset your password.
              </p>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="space-y-6">
                <div>
                  <Label>
                    Email <span className="text-error-500">*</span>
                  </Label>
                  <Input
                    type="email"
                    name="email"
                    placeholder="you@company.com"
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div>
                  <Button className="w-full" size="sm">
                    Send reset link
                  </Button>
                </div>
              </div>
            </form>
            <div className="mt-5">
              <p className="text-sm font-normal text-center text-gray-700 dark:text-gray-400 sm:text-start">
                Remember your password?{" "}
                <Link
                  href="/signin"
                  className="text-brand-500 transition-colors hover:text-brand-600 dark:text-brand-400"
                >
                  Sign in
                </Link>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
