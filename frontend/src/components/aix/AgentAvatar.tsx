"use client";

import React, { useState } from "react";

/**
 * Generic, white-labelable avatar: initials on a stored accent colour, or an
 * optional image URL. R16 requires an editable worker name/identity per
 * deployment — a template can't ship with art for one fictional persona baked in.
 */

interface AgentAvatarProps {
  initials: string;
  size?: "sm" | "md" | "lg";
  showStatus?: boolean;
  status?: "active" | "training" | "paused";
  accentColor?: string;
  avatarUrl?: string | null;
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

// The worker's own accent color defaults to this same brand orange server-side
// (see withIdentityDefaults in use-worker-profile.ts), so falling back to it
// here — rather than a hash-derived hue — means most workers never see a color
// flash at all while identity is still loading, and the ones who did pick a
// custom color at least get the app's one on-brand accent (CLAUDE.md: orange
// #F47920 only, never blue/indigo) instead of an arbitrary generated hue.
const DEFAULT_ACCENT_COLOR = "#F47920";

export default function AgentAvatar({
  initials,
  size = "md",
  showStatus = false,
  status = "active",
  accentColor,
  avatarUrl,
}: AgentAvatarProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const background = accentColor || DEFAULT_ACCENT_COLOR;
  const showImage = Boolean(avatarUrl) && failedUrl !== avatarUrl;

  return (
    <span className="relative inline-flex shrink-0">
      <span
        className={`relative flex items-center justify-center overflow-hidden rounded-full font-semibold text-white ring-1 ring-black/5 dark:ring-white/10 ${sizeClasses[size]}`}
        style={{ backgroundColor: background }}
      >
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl ?? ""}
            alt=""
            className="absolute inset-0 size-full object-cover"
            onError={() => setFailedUrl(avatarUrl ?? "")}
          />
        ) : (
          initials.slice(0, 2).toUpperCase()
        )}
      </span>
      {showStatus && (
        <span
          className={`absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-white dark:border-gray-900 ${statusColor[status]}`}
        />
      )}
    </span>
  );
}
