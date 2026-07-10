"use client";
import React, { useEffect, useRef, useState } from "react";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import Input from "@/components/form/input/InputField";
import TextArea from "@/components/form/input/TextArea";
import Switch from "@/components/form/switch/Switch";
import StatCard from "@/components/aix/StatCard";
import { BoltIcon, DocsIcon, DollarLineIcon } from "@/icons";

const modelOptions = [
  { value: "claude-sonnet", label: "Claude Sonnet (default)" },
  { value: "claude-opus", label: "Claude Opus" },
  { value: "claude-haiku", label: "Claude Haiku" },
];

const toneChips = ["Confident", "Grounded", "Direct", "Story-driven", "Warm"];

const SECTIONS = [
  { id: "model", label: "Model preferences" },
  { id: "behavior", label: "Behavior" },
  { id: "voice", label: "Brand voice" },
  { id: "usage", label: "Usage" },
  { id: "danger", label: "Danger zone" },
];

const cardClass =
  "scroll-mt-24 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6";

export default function AiSettingsPanel() {
  const [temperature, setTemperature] = useState(0.7);
  const [voice, setVoice] = useState(
    "Write like a founder talking to another operator: plain language, short sentences, numbers over adjectives. Never call the product a chatbot."
  );
  const [activeTones, setActiveTones] = useState<string[]>([
    "Confident",
    "Direct",
  ]);
  const [activeId, setActiveId] = useState(SECTIONS[0].id);

  const toggleTone = (tone: string) =>
    setActiveTones((prev) =>
      prev.includes(tone) ? prev.filter((t) => t !== tone) : [...prev, tone]
    );

  // Scroll-spy: highlight the section-nav link for whatever's in view.
  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter(
      Boolean
    ) as HTMLElement[];
    if (!els.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top
          );
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-96px 0px -55% 0px", threshold: 0 }
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  const jump = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveId(id);
  };

  return (
    <div className="flex flex-col gap-5 sm:gap-6 lg:flex-row">
      {/* Section nav */}
      <aside className="lg:w-56 lg:shrink-0">
        <nav className="flex flex-wrap gap-1 lg:sticky lg:top-24 lg:flex-col">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              onClick={(e) => jump(e, s.id)}
              aria-current={activeId === s.id ? "true" : undefined}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 ${
                activeId === s.id
                  ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400"
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200"
              }`}
            >
              {s.label}
            </a>
          ))}
        </nav>
      </aside>

      {/* Section cards */}
      <div className="min-w-0 flex-1 space-y-5 sm:space-y-6">
        <div id="model" data-aix-id="AIX-154.1" className={cardClass}>
          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Model preferences
          </h3>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Defaults applied to every generator unless overridden per request.
          </p>
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <div>
              <Label>Default model</Label>
              <Select
                options={modelOptions}
                defaultValue="claude-sonnet"
                onChange={() => {}}
              />
            </div>
            <div>
              <Label>Temperature ({temperature.toFixed(1)})</Label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.1}
                value={temperature}
                onChange={(e) => setTemperature(Number(e.target.value))}
                aria-label="Temperature"
                className="mt-3.5 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-gray-200 accent-brand-500 focus-visible:outline-2 focus-visible:outline-brand-500/50 dark:bg-gray-800"
              />
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Lower is more predictable, higher is more creative.
              </p>
            </div>
            <div>
              <Label>Max output length (tokens)</Label>
              <Input type="number" defaultValue={2048} min="256" max="8192" />
            </div>
          </div>
        </div>

        <div id="behavior" data-aix-id="AIX-154.2" className={cardClass}>
          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Behavior
          </h3>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            How generated content behaves once it leaves the composer.
          </p>
          <div className="mt-5 space-y-5">
            <div className="flex flex-col gap-1">
              <Switch label="Auto-handoff to human" defaultChecked />
              <p className="pl-14 text-xs text-gray-500 dark:text-gray-400">
                Route low-confidence outputs to a teammate before they ship.
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <Switch label="Cite sources" defaultChecked />
              <p className="pl-14 text-xs text-gray-500 dark:text-gray-400">
                Append knowledge-base references to factual claims.
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <Switch label="Profanity filter" />
              <p className="pl-14 text-xs text-gray-500 dark:text-gray-400">
                Block flagged language in all generated copy.
              </p>
            </div>
          </div>
        </div>

        <div id="voice" data-aix-id="AIX-154.3" className={cardClass}>
          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Brand voice
          </h3>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Every generator reads this before writing a word.
          </p>
          <div className="mt-5">
            <Label>Voice guidelines</Label>
            <TextArea rows={4} value={voice} onChange={setVoice} />
          </div>
          <div className="mt-4">
            <Label>Tone</Label>
            <div className="flex flex-wrap gap-2">
              {toneChips.map((tone) => (
                <button
                  key={tone}
                  onClick={() => toggleTone(tone)}
                  className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-brand-500/50 ${
                    activeTones.includes(tone)
                      ? "bg-gray-800 text-white dark:bg-white/10 dark:text-white/90"
                      : "border border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400 dark:hover:border-gray-700"
                  }`}
                >
                  {tone}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-6 flex justify-end">
            <Button size="sm">Save changes</Button>
          </div>
        </div>

        <div id="usage" data-aix-id="AIX-154.4" className="scroll-mt-24">
          <h3 className="mb-4 text-base font-semibold text-gray-800 dark:text-white/90">
            Usage this month
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 md:gap-6">
            <StatCard
              label="Generations"
              value="1,842"
              delta={12.4}
              deltaLabel="vs last month"
              icon={<BoltIcon className="size-5" />}
              trend={[1180, 1320, 1290, 1450, 1510, 1620, 1720, 1842]}
            />
            <StatCard
              label="Tokens"
              value="3.2M"
              delta={8.1}
              deltaLabel="vs last month"
              icon={<DocsIcon className="size-5" />}
              trend={[2.4, 2.6, 2.5, 2.8, 2.9, 3.0, 3.1, 3.2]}
            />
            <StatCard
              label="Est. cost"
              value="$214"
              delta={-4.6}
              deltaLabel="vs last month"
              invertDelta
              icon={<DollarLineIcon className="size-5" />}
              trend={[248, 236, 240, 228, 226, 222, 218, 214]}
            />
          </div>
        </div>

        <div
          id="danger"
          data-aix-id="AIX-154.5"
          className="scroll-mt-24 rounded-2xl border border-error-300 bg-white p-5 dark:border-error-500/40 dark:bg-white/[0.03] md:p-6"
        >
          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Danger zone
          </h3>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Reset all AI settings to workspace defaults. Saved voice guidelines
              and tone selections will be lost.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 !text-error-600 !ring-error-300 hover:!bg-error-50 dark:!text-error-500 dark:!ring-error-500/40 dark:hover:!bg-error-500/10"
            >
              Reset defaults
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
