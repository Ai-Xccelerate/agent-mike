import React from "react";

/**
 * Generic, white-labelable avatar: initials on a deterministic color, not a
 * bespoke portrait for a specific named agent. R16 requires an editable
 * worker name/identity per deployment — a template can't ship with art for
 * one fictional persona baked in.
 */

interface AgentAvatarProps {
  initials: string;
  size?: "sm" | "md" | "lg";
  showStatus?: boolean;
  status?: "active" | "training" | "paused";
}

const sizeClasses = {
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-14 text-lg",
};

const statusColor = {
  active: "bg-success-500",
  training: "bg-warning-500",
  paused: "bg-gray-400",
};

// Deterministic hue from the initials so a given worker's avatar stays stable
// across renders without needing a stored color field.
function hueFrom(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) % 360;
  return hash;
}

export default function AgentAvatar({
  initials,
  size = "md",
  showStatus = false,
  status = "active",
}: AgentAvatarProps) {
  const hue = hueFrom(initials || "AW");
  return (
    <span className="relative inline-flex shrink-0">
      <span
        className={`relative flex items-center justify-center overflow-hidden rounded-full font-semibold text-white ring-1 ring-black/5 dark:ring-white/10 ${sizeClasses[size]}`}
        style={{ backgroundColor: `hsl(${hue} 55% 45%)` }}
      >
        {initials.slice(0, 2).toUpperCase()}
      </span>
      {showStatus && (
        <span
          className={`absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-white dark:border-gray-900 ${statusColor[status]}`}
        />
      )}
    </span>
  );
}
