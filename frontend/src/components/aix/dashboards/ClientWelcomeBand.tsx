import React from "react";

interface ClientWelcomeBandProps {
  clientName: string;
  headline: string;
}

export default function ClientWelcomeBand({
  clientName,
  headline,
}: ClientWelcomeBandProps) {
  return (
    <div className="rounded-2xl bg-gradient-to-r from-brand-500 to-brand-400 p-5 md:p-8">
      <h2 className="text-xl font-bold tracking-tight text-white md:text-2xl">
        Good morning, {clientName}
      </h2>
      <p className="mt-1.5 text-sm text-white/90 md:text-base">{headline}</p>
    </div>
  );
}
