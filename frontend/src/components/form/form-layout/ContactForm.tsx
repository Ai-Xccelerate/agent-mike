"use client";
import React, { useState } from "react";

import ComponentCard from "@/components/common/ComponentCard";
import Checkbox from "@/components/form/input/Checkbox";
import Input from "@/components/form/input/InputField";
import TextArea from "@/components/form/input/TextArea";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import Button from "@/components/ui/button/Button";
import { useToast } from "@/components/ui/toast/ToastProvider";

const topicOptions = [
  { value: "sales", label: "Talk to sales" },
  { value: "support", label: "Product support" },
  { value: "billing", label: "Billing question" },
  { value: "partnership", label: "Partnership enquiry" },
];

export default function ContactForm() {
  const toast = useToast();
  const [message, setMessage] = useState("");
  const [topic, setTopic] = useState("");
  const [subscribed, setSubscribed] = useState(true);

  return (
    <ComponentCard title="Contact form" desc="Get in touch with the AIX team. We reply within one business day.">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          toast({ variant: "success", title: "Message sent", message: "Someone from the AIX team will reply by tomorrow." });
        }}
      >
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
            <div>
              <Label htmlFor="contact-name" required>
                Full name
              </Label>
              <Input id="contact-name" type="text" placeholder="Dana Ruiz" autoComplete="name" required />
            </div>
            <div>
              <Label htmlFor="contact-email" required>
                Work email
              </Label>
              <Input id="contact-email" type="email" placeholder="dana@fleetwise.com" autoComplete="email" required />
            </div>
          </div>
          <div>
            <Label htmlFor="contact-topic">Topic</Label>
            <Select id="contact-topic" options={topicOptions} placeholder="What is this about?" value={topic} onChange={setTopic} />
          </div>
          <div>
            <Label required>Message</Label>
            <TextArea rows={4} value={message} onChange={setMessage} placeholder="Tell us what you're trying to solve." />
          </div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <Checkbox label="Send me the monthly AIX product update" checked={subscribed} onChange={setSubscribed} />
            {/* Outline: the agent form above holds this view's one primary button. */}
            <Button size="sm" variant="outline" type="submit" className="self-end sm:self-auto">
              Send message
            </Button>
          </div>
        </div>
      </form>
    </ComponentCard>
  );
}
