"use client";
import React, { useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Select from "@/components/form/Select";
import Button from "@/components/ui/button/Button";
import Badge from "@/components/ui/badge/Badge";

const roleOptions = [
  { value: "admin", label: "Admin" },
  { value: "member", label: "Member" },
  { value: "viewer", label: "Viewer" },
];

export default function InviteTeammateForm() {
  const [invited, setInvited] = useState(false);

  return (
    <ComponentCard
      title="Invite teammate"
      desc="Give a colleague access to your AIX workspace."
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setInvited(true);
        }}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Label htmlFor="invite-email">
              Email address <span className="text-error-500">*</span>
            </Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="teammate@yourcompany.com"
            />
          </div>
          <div className="w-full sm:w-40">
            <Label>Role</Label>
            <Select
              options={roleOptions}
              placeholder="Role"
              defaultValue="member"
              onChange={() => {}}
            />
          </div>
          <div className="shrink-0">
            <Button size="sm" className="w-full sm:w-auto">
              Send invite
            </Button>
          </div>
        </div>
        {invited && (
          <div className="mt-4">
            <Badge variant="light" color="success" size="sm">
              Invite sent — they&apos;ll get an email shortly
            </Badge>
          </div>
        )}
      </form>
    </ComponentCard>
  );
}
