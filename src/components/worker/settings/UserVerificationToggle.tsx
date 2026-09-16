"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import { getSkillsCatalog, type SkillCatalogEntry } from "@/lib/worker-api";
import { IDENTITY_UPDATED_EVENT } from "@/lib/use-worker-profile";

/** Ships on disk in the backend catalog; the guardrail switches it on. */
const VERIFY_CUSTOMER_SKILL_ID = "verify-customer";

/**
 * "Require user verification" is not a check the server runs — it is the
 * Verify customer skill, and this switch is how it gets turned on.
 *
 * Three things that are easy to get wrong here:
 *
 * **It cannot be turned on without a CRM.** Verification is a CRM contact
 * lookup, so without a connection the skill would instruct the worker to call
 * a tool it was never given. The server refuses it, so the switch is disabled
 * rather than offering a change that comes back 422 — but only in the "on"
 * direction, since turning it *off* must always stay possible.
 *
 * **Turning it on does something, and says so.** The save switches the skill
 * on. The dialog exists so the manager knows that happened and where to go
 * and rewrite it, rather than discovering a skill they did not enable.
 *
 * **Turning it off does not turn the skill off.** A manager may have rewritten
 * it and still want it running. That asymmetry is fine, but it cannot be
 * silent — otherwise they switch the guardrail off, assume verification
 * stopped, and it has not.
 */
export default function UserVerificationToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  const [skill, setSkill] = useState<SkillCatalogEntry | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [explaining, setExplaining] = useState(false);

  useEffect(() => {
    let cancelled = false;
    function refresh() {
      getSkillsCatalog()
        .then((skills) => {
          if (cancelled) return;
          setSkill(skills.find((entry) => entry.id === VERIFY_CUSTOMER_SKILL_ID) ?? null);
          setLoaded(true);
        })
        .catch(() => {
          // Fall through to the server's own 422 rather than blocking the screen
          // because one lookup failed.
          if (!cancelled) setLoaded(true);
        });
    }
    refresh();
    // A save elsewhere in this page flips the skill's `enabled` server-side,
    // so the mount-time snapshot goes stale the moment that happens — refetch
    // whenever one lands, or "stays switched on" below can go silent.
    window.addEventListener(IDENTITY_UPDATED_EVENT, refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(IDENTITY_UPDATED_EVENT, refresh);
    };
  }, []);

  const missingCrm = Boolean(skill && !skill.requirementsMet);
  const blocked = missingCrm && !checked;
  // `enabled` is the saved state, which is what makes it the right thing to
  // read: the skill is switched on by the save, not by this click.
  const skillStillOn = Boolean(skill?.enabled) && !checked;

  function toggle() {
    const next = !checked;
    onChange(next);
    if (next) setExplaining(true);
  }

  return (
    <>
      <div className="mt-5 rounded-xl bg-gray-50 p-4 dark:bg-white/[0.03]">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Require user verification
            </p>
            <p className="mt-0.5 text-xs leading-5 text-gray-500 dark:text-gray-400">
              Ask for the customer&rsquo;s email address and check it against your CRM before discussing
              account details. This is an instruction the worker follows, not a check that runs before it.
            </p>
          </div>
          <button
            role="switch"
            aria-checked={checked}
            aria-label={`${checked ? "Stop requiring" : "Require"} user verification`}
            // Only the "turn on" direction is ever gated — turning off must
            // always stay possible, per the invariant documented above.
            disabled={checked ? false : !loaded || blocked}
            onClick={toggle}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 disabled:cursor-not-allowed disabled:opacity-40 ${
              checked ? "bg-brand-500" : "bg-gray-200 dark:bg-gray-700"
            }`}
          >
            <span
              className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white transition-transform ${
                checked ? "translate-x-5" : ""
              }`}
            />
          </button>
        </div>

        {blocked && (
          <p className="mt-3 border-t border-gray-200 pt-3 text-xs leading-5 text-gray-500 dark:border-gray-700 dark:text-gray-400">
            Connect a CRM under{" "}
            <Link
              href="/settings/integrations"
              className="font-medium text-brand-600 hover:underline dark:text-brand-400"
            >
              Integrations
            </Link>{" "}
            to use this — verification works by looking the customer up in it.
          </p>
        )}

        {checked && !missingCrm && (
          <p className="mt-3 border-t border-gray-200 pt-3 text-xs leading-5 text-gray-500 dark:border-gray-700 dark:text-gray-400">
            Uses the Verify customer skill. Change what it asks for, and when, under{" "}
            <Link
              href="/settings/skills"
              className="font-medium text-brand-600 hover:underline dark:text-brand-400"
            >
              Skills
            </Link>
            .
          </p>
        )}

        {checked && missingCrm && (
          <p className="mt-3 border-t border-gray-200 pt-3 text-xs font-medium leading-5 text-warning-600 dark:border-gray-700 dark:text-warning-400">
            Your CRM is no longer connected, so the worker cannot verify anyone. Reconnect it under
            Integrations.
          </p>
        )}

        {skillStillOn && (
          <p className="mt-3 border-t border-gray-200 pt-3 text-xs leading-5 text-gray-500 dark:border-gray-700 dark:text-gray-400">
            The Verify customer skill stays switched on — turning this off does not remove it, in case you
            have rewritten it. Switch it off under{" "}
            <Link
              href="/settings/skills"
              className="font-medium text-brand-600 hover:underline dark:text-brand-400"
            >
              Skills
            </Link>{" "}
            if you do not want it.
          </p>
        )}
      </div>

      <Modal
        isOpen={explaining}
        onClose={() => setExplaining(false)}
        ariaLabel="How user verification works"
        className="w-full max-w-md p-6"
      >
        <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
          Verification is a skill
        </h3>
        <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
          Saving this switches on the <span className="font-medium">Verify customer</span> skill. It tells
          this worker to ask for the customer&rsquo;s email address, look it up in your CRM, and treat them
          as verified only on an exact match — a similar name or a matching phone number is not enough.
        </p>
        <p className="mt-3 text-sm leading-6 text-gray-500 dark:text-gray-400">
          You can rewrite exactly what it asks for, and what it refuses to discuss until then, under Skills.
        </p>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Link href="/settings/skills">
            <Button size="sm" variant="outline">
              Go to Skills
            </Button>
          </Link>
          <Button size="sm" onClick={() => setExplaining(false)}>
            Got it
          </Button>
        </div>
      </Modal>
    </>
  );
}
