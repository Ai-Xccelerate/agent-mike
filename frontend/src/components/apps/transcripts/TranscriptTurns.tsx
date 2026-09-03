"use client";

import React, { useState } from "react";
import Button from "@/components/ui/button/Button";
import AgentAvatar, { AgentName } from "@/components/aix/AgentAvatar";

type Speaker =
  | { kind: "human"; name: string; initials: string }
  | { kind: "agent"; name: AgentName };

interface Turn {
  speaker: Speaker;
  time: string;
  text: string;
}

const rahul: Speaker = { kind: "human", name: "Rahul Bhavsar", initials: "RB" };
const sarah: Speaker = { kind: "human", name: "Sarah Kim", initials: "SK" };
const dana: Speaker = { kind: "human", name: "Dana Whitmore", initials: "DW" };
const james: Speaker = { kind: "human", name: "James Croft", initials: "JC" };
const tony: Speaker = { kind: "agent", name: "Tony" };

const turns: Turn[] = [
  {
    speaker: rahul,
    time: "00:12",
    text: "Thanks for making time, Dana. Agenda today: quarter in review across the three agents you're running, the open technical items, and then what an expanded footprint could look like going into Q3.",
  },
  {
    speaker: dana,
    time: "01:04",
    text: "Sounds good. Before we start — the team has been genuinely impressed with response times this quarter. Our reps keep mentioning that inbound leads get touched before they've even seen them.",
  },
  {
    speaker: sarah,
    time: "02:31",
    text: "That's Pepper doing its job. Median first response is sitting at 41 seconds this quarter, and qualified handoffs to your reps are up 23% quarter over quarter. Nick sourced 118 net-new accounts into the pipeline in the same window.",
  },
  {
    speaker: james,
    time: "05:47",
    text: "One thing from my side — we changed our lead scoring fields in HubSpot in May, and I want to make sure the sync picks up the two custom properties we added.",
  },
  {
    speaker: tony,
    time: "06:15",
    text: "I looked at your integration before the call. The two new properties aren't mapped yet, but they're standard field types — I can have the sync updated and backfilled within a day once you confirm which records should be in scope.",
  },
  {
    speaker: dana,
    time: "14:22",
    text: "Let's talk about the renewal side. Our churn risk lives in the accounts nobody touches after onboarding. Is that what George is built for? What would it take to add him to our plan?",
  },
  {
    speaker: rahul,
    time: "15:03",
    text: "Exactly that. George watches usage and engagement signals across your book, flags accounts drifting toward churn, and runs the outreach before renewal conversations get hard. For your account volume it's headcount math — one George versus the two CSMs you were planning to hire.",
  },
  {
    speaker: dana,
    time: "22:48",
    text: "That framing works for our CFO. Send me the overview and pricing and I'll get it in front of the leadership team before our budget lock on the 15th.",
  },
  {
    speaker: sarah,
    time: "31:10",
    text: "I'll send that today, along with the attribution report so you can see exactly which closed-won deals started with Nick or Pepper. It makes the expansion case for you.",
  },
  {
    speaker: rahul,
    time: "44:36",
    text: "Great session. Recap: Tony handles the HubSpot field sync this week, Sarah sends the George overview and the attribution report, and we'll draft the Q3 expansion proposal with the renewal review booked for mid-August.",
  },
];

function SpeakerAvatar({ speaker }: { speaker: Speaker }) {
  if (speaker.kind === "agent") {
    return <AgentAvatar name={speaker.name} size="sm" />;
  }
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
      {speaker.initials}
    </span>
  );
}

export default function TranscriptTurns() {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? turns : turns.slice(0, 6);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-800 md:px-6">
        <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
          Full transcript
        </h3>
      </div>
      <div className="space-y-5 p-5 md:p-6">
        {visible.map((turn, i) => (
          <div key={i} className="flex gap-3">
            <SpeakerAvatar speaker={turn.speaker} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                  {turn.speaker.name}
                </p>
                <span className="font-mono text-theme-xs text-gray-500 dark:text-gray-400">
                  {turn.time}
                </span>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                {turn.text}
              </p>
            </div>
          </div>
        ))}
        {!expanded && (
          <div className="pt-1">
            <Button size="sm" variant="outline" onClick={() => setExpanded(true)}>
              Show full transcript
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
