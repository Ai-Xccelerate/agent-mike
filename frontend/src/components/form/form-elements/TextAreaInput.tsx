"use client";
import React, { useState } from "react";

import ComponentCard from "@/components/common/ComponentCard";

import TextArea from "../input/TextArea";
import Label from "../Label";

export default function TextAreaInput() {
  const [brief, setBrief] = useState("");
  const [reply, setReply] = useState("Thanks for the note, we");

  return (
    <ComponentCard title="Textarea" desc="Longer answers: a brief, a note, a reply.">
      <div className="space-y-5">
        <div>
          <Label>Brief for Jules</Label>
          <TextArea
            value={brief}
            onChange={setBrief}
            rows={5}
            placeholder="Who to reach, what to say, and what a good reply looks like."
          />
        </div>

        <div>
          <Label>Disabled</Label>
          <TextArea rows={4} disabled placeholder="Locked while Joy reviews the contract." />
        </div>

        <div>
          <Label>With an error</Label>
          <TextArea
            rows={4}
            value={reply}
            error
            onChange={setReply}
            hint="Finish the reply before you send it."
          />
        </div>
      </div>
    </ComponentCard>
  );
}
