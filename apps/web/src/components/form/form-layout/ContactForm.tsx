"use client";
import React, { useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Select from "@/components/form/Select";
import TextArea from "@/components/form/input/TextArea";
import Checkbox from "@/components/form/input/Checkbox";
import Button from "@/components/ui/button/Button";

const topicOptions = [
  { value: "sales", label: "Talk to sales" },
  { value: "support", label: "Product support" },
  { value: "billing", label: "Billing question" },
  { value: "partnership", label: "Partnership inquiry" },
];

export default function ContactForm() {
  const [message, setMessage] = useState("");
  const [subscribed, setSubscribed] = useState(true);

  return (
    <ComponentCard
      title="Contact form"
      desc="Get in touch with the AIX team — we reply within one business day."
    >
      <form onSubmit={(e) => e.preventDefault()}>
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
            <div>
              <Label htmlFor="contact-name">
                Full name <span className="text-error-500">*</span>
              </Label>
              <Input id="contact-name" type="text" placeholder="Dana Whitfield" />
            </div>
            <div>
              <Label htmlFor="contact-email">
                Work email <span className="text-error-500">*</span>
              </Label>
              <Input
                id="contact-email"
                type="email"
                placeholder="dana@meridianlogistics.com"
              />
            </div>
          </div>
          <div>
            <Label>Topic</Label>
            <Select
              options={topicOptions}
              placeholder="What is this about?"
              onChange={() => {}}
            />
          </div>
          <div>
            <Label>
              Message <span className="text-error-500">*</span>
            </Label>
            <TextArea
              rows={4}
              value={message}
              onChange={setMessage}
              placeholder="Tell us what you're trying to solve."
            />
          </div>
          <Checkbox
            label="Send me the monthly AIX product update"
            checked={subscribed}
            onChange={setSubscribed}
          />
          <div className="flex justify-end">
            <Button size="sm">Send message</Button>
          </div>
        </div>
      </form>
    </ComponentCard>
  );
}
