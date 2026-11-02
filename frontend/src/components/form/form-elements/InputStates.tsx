"use client";
import React, { useState } from "react";

import ComponentCard from "@/components/common/ComponentCard";

import Input from "../input/InputField";
import Label from "../Label";

const EMAIL = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export default function InputStates() {
  const [email, setEmail] = useState("dana@fleetwise");
  const valid = EMAIL.test(email);

  return (
    <ComponentCard title="Input states" desc="Error, success and disabled, each with its line under the field.">
      <div className="space-y-5">
        <div>
          <Label htmlFor="is-error">Work email</Label>
          <Input
            id="is-error"
            type="email"
            value={email}
            error={!valid}
            success={valid}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="dana@fleetwise.com"
            hint={valid ? "Looks right. We'll send the invite here." : "Enter a full address, like dana@fleetwise.com."}
          />
        </div>

        <div>
          <Label htmlFor="is-success">Work email</Label>
          <Input
            id="is-success"
            type="email"
            defaultValue="priya@ledgerly.io"
            success
            hint="Verified on 12 October."
          />
        </div>

        <div>
          <Label htmlFor="is-disabled">Workspace email</Label>
          <Input
            id="is-disabled"
            type="text"
            defaultValue="revops@aixccelerate.com"
            disabled
            hint="Only an admin can change this."
          />
        </div>
      </div>
    </ComponentCard>
  );
}
