import AgentAvatar from "@/components/aix/AgentAvatar";

interface WorkerHeroProps {
  displayName: string;
  avatarInitials: string;
  tagline: string;
  stats: { label: string; value: string }[];
  accentColor?: string;
  avatarUrl?: string | null;
  status?: "active" | "paused";
}

export default function WorkerHero({
  displayName,
  avatarInitials,
  tagline,
  stats,
  accentColor,
  avatarUrl,
  status = "active",
}: WorkerHeroProps) {
  return (
    <section className="glass-surface flex flex-col gap-5 rounded-2xl border border-gray-200 p-5 dark:border-gray-800 md:flex-row md:items-center md:justify-between md:p-6">
      <div className="flex items-center gap-4">
        <AgentAvatar
          initials={avatarInitials}
          size="lg"
          showStatus
          status={status}
          accentColor={accentColor}
          avatarUrl={avatarUrl}
        />
        <div>
          <h1 className="font-display text-lg font-semibold text-gray-900 dark:text-white">{displayName}</h1>
          <p className="mt-1 max-w-md text-sm text-gray-500 dark:text-gray-400">{tagline}</p>
        </div>
      </div>
      <dl className="flex flex-wrap gap-6">
        {stats.map((stat) => (
          <div key={stat.label}>
            <dt className="text-xs text-gray-500 dark:text-gray-400">{stat.label}</dt>
            <dd className="font-display text-xl font-semibold text-gray-900 dark:text-white">{stat.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
