"use client";

import { Modal } from "@/components/ui/modal";

export type ConnectMethod = "oauth" | "api_key" | "client_credentials";

const METHODS: { method: ConnectMethod; title: string; description: string }[] = [
  {
    method: "oauth",
    title: "Sign in with Atlassian",
    description: "A person signs in with their own Atlassian account.",
  },
  {
    method: "api_key",
    title: "API key",
    description: "A service account's API key, with its email and your site name. Nobody signs in.",
  },
  {
    method: "client_credentials",
    title: "OAuth 2.0 client credentials",
    description: "A service account's client ID and secret. Nobody signs in.",
  },
];

/** Asks how to connect, before sending the manager to the sign-in for that way. */
export default function ConnectMethodDialog({
  label,
  methods,
  isOpen,
  onClose,
  onChoose,
}: {
  label: string;
  /** The ways this server has set up; null while still asking it. */
  methods: ConnectMethod[] | null;
  isOpen: boolean;
  onClose: () => void;
  onChoose: (method: ConnectMethod) => void;
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} ariaLabel={`Connect ${label}`} className="w-full max-w-lg p-6 sm:p-7">
      {isOpen && (
        <div>
          <div className="pr-8">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">How do you want to connect {label}?</h3>
            <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
              Pick how your team connects. To switch later, disconnect first.
            </p>
          </div>
          <div className="mt-5 flex flex-col gap-3">
            {methods === null && <p className="text-sm text-gray-500 dark:text-gray-400">Checking what is set up…</p>}
            {METHODS.filter((option) => methods?.includes(option.method)).map((option) => (
              <button
                key={option.method}
                type="button"
                onClick={() => onChoose(option.method)}
                className="focus-ring rounded-2xl border border-gray-300/70 bg-white p-4 text-left transition-colors hover:border-brand-500 dark:border-gray-800 dark:bg-white/[0.03] dark:hover:border-brand-500"
              >
                <span className="block text-sm font-medium text-gray-800 dark:text-white/90">{option.title}</span>
                <span className="mt-1 block text-xs leading-5 text-gray-500 dark:text-gray-400">{option.description}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
