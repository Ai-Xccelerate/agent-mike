"use client";
import React from "react";
import PromptComposer from "./PromptComposer";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import { CopyIcon } from "@/icons";

const languageOptions = [
  { value: "typescript", label: "TypeScript" },
  { value: "python", label: "Python" },
  { value: "go", label: "Go" },
  { value: "sql", label: "SQL" },
];

const codeLines: { text: string; indent: number }[] = [
  { text: 'import { NextRequest, NextResponse } from "next/server";', indent: 0 },
  { text: 'import { createLead } from "@/lib/crm";', indent: 0 },
  { text: "", indent: 0 },
  { text: "interface HubSpotLeadPayload {", indent: 0 },
  { text: "objectId: number;", indent: 1 },
  { text: "propertyName: string;", indent: 1 },
  { text: "propertyValue: string;", indent: 1 },
  { text: "occurredAt: number;", indent: 1 },
  { text: "}", indent: 0 },
  { text: "", indent: 0 },
  { text: "export async function POST(req: NextRequest) {", indent: 0 },
  { text: "const signature = req.headers.get(\"x-hubspot-signature-v3\");", indent: 1 },
  { text: "if (!verifySignature(signature, await req.text())) {", indent: 1 },
  { text: "return NextResponse.json({ error: \"invalid signature\" }, { status: 401 });", indent: 2 },
  { text: "}", indent: 1 },
  { text: "const events: HubSpotLeadPayload[] = await req.json();", indent: 1 },
  { text: "const leads = await Promise.all(events.map(createLead));", indent: 1 },
  { text: "return NextResponse.json({ processed: leads.length });", indent: 1 },
  { text: "}", indent: 0 },
];

export default function CodeGeneratorPanel() {
  return (
    <div className="space-y-5 sm:space-y-6">
      <div data-aix-id="AIX-152.1">
        <PromptComposer
          placeholder="Generate a webhook handler for new HubSpot leads. Verify the request signature, parse the event batch, and hand each lead to our CRM client."
          buttonLabel="Generate code"
        />
      </div>

      <div data-aix-id="AIX-152.2" className="w-full sm:w-56">
        <Label>Language</Label>
        <Select
          options={languageOptions}
          defaultValue="typescript"
          onChange={() => {}}
        />
      </div>

      <div
        data-aix-id="AIX-152.3"
        className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-900"
      >
        <div className="flex items-center justify-between border-b border-gray-800 pr-3">
          <div className="flex items-center">
            <span className="border-b-2 border-brand-500 px-4 py-3 font-mono text-xs text-white/90">
              route.ts
            </span>
            <span className="px-4 py-3 font-mono text-xs text-gray-500">
              app/api/webhooks/hubspot
            </span>
          </div>
          <button
            aria-label="Copy code"
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-400 transition-colors duration-150 hover:bg-white/5 hover:text-gray-200 focus-visible:outline-2 focus-visible:outline-brand-500/50"
          >
            <CopyIcon className="size-4" />
            Copy
          </button>
        </div>
        <div className="overflow-x-auto">
          <pre className="p-5 text-sm leading-6 md:p-6">
            <code className="font-mono text-gray-300">
              {codeLines.map((line, i) => (
                <span key={i} className="block whitespace-pre">
                  <span className="mr-4 inline-block w-6 select-none text-right text-gray-600">
                    {i + 1}
                  </span>
                  {"  ".repeat(line.indent) + line.text}
                </span>
              ))}
            </code>
          </pre>
        </div>
      </div>

      <div
        data-aix-id="AIX-152.4"
        className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6"
      >
        <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
          What this code does
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
          This route handles HubSpot webhook POSTs by first validating the
          v3 request signature, rejecting anything unsigned with a 401. Valid
          event batches are parsed, each lead is created in the CRM in
          parallel, and the handler responds with the number of records
          processed.
        </p>
      </div>
    </div>
  );
}
