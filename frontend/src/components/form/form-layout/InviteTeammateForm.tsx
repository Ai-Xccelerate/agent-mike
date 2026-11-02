"use client";
import React, { useState } from "react";

import ComponentCard from "@/components/common/ComponentCard";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import Button from "@/components/ui/button/Button";
import { useToast } from "@/components/ui/toast/ToastProvider";

const roleOptions = [
  { value: "admin", label: "Admin" },
  { value: "member", label: "Member" },
  { value: "viewer", label: "Viewer" },
];

const ROLE_LABEL: Record<string, string> = { admin: "Admin", member: "Member", viewer: "Viewer" };

interface Invite {
  email: string;
  role: string;
  sent: string;
}

const PENDING: Invite[] = [
  { email: "priya@ledgerly.io", role: "admin", sent: "Sent 2 days ago" },
  { email: "tom.becker@acmecorp.com", role: "member", sent: "Sent yesterday" },
  { email: "aisha@northwind.com", role: "viewer", sent: "Sent 3 hours ago" },
];

const EMAIL = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

/** An invite form and the invites still waiting on an answer. */
export default function InviteTeammateForm() {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState<Invite[]>(PENDING);

  const send = () => {
    const address = email.trim();
    if (!EMAIL.test(address)) {
      setProblem("Enter a work email, like dana@fleetwise.com.");
      return;
    }
    setProblem(null);
    setPending((prev) => [{ email: address, role, sent: "Sent just now" }, ...prev.filter((invite) => invite.email !== address)]);
    setEmail("");
    toast({ variant: "success", title: "Invite sent", message: `${address} will get an email in a minute.` });
  };

  return (
    <ComponentCard title="Invite a teammate" desc="Give a colleague access to your AIX workspace.">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <Label htmlFor="invite-email" required>
              Email address
            </Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                if (problem) setProblem(null);
              }}
              placeholder="dana@northwind.com"
              autoComplete="off"
              error={Boolean(problem)}
              hint={problem ?? undefined}
            />
          </div>
          <div className="w-full sm:w-32">
            <Label htmlFor="invite-role">Role</Label>
            <Select id="invite-role" options={roleOptions} value={role} onChange={setRole} />
          </div>
          <div className="shrink-0 sm:pt-[26px]">
            {/* 40px, level with the fields beside it. */}
            <Button variant="outline" type="submit" className="w-full sm:w-auto">
              Send invite
            </Button>
          </div>
        </div>
      </form>

      <div>
        <h4 className="flex items-baseline gap-2 text-theme-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Waiting to join
          <span className="tabular-nums">{pending.length}</span>
        </h4>
        <ul className="mt-2 divide-y divide-gray-100 dark:divide-white/[0.05]">
          {pending.map((invite) => (
            <li key={invite.email} className="flex items-center gap-3 py-2.5">
              <span
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[11px] font-semibold uppercase text-gray-700 dark:bg-white/[0.08] dark:text-gray-200"
              >
                {invite.email.slice(0, 2)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-theme-sm font-medium text-gray-900 dark:text-white">{invite.email}</p>
                <p className="text-theme-xs text-gray-500 dark:text-gray-400">
                  {ROLE_LABEL[invite.role]} · {invite.sent}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => toast({ variant: "info", title: "Invite sent again", message: invite.email })}
              >
                Resend
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </ComponentCard>
  );
}
