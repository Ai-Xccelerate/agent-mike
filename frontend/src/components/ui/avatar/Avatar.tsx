/**
 * A person's photo (LIB-AVATAR), round, with an optional presence dot. For an
 * agent use `aix/AgentAvatar` (its portrait and identity colour are locked);
 * for someone with no photo, `AvatarText` (initials on a neutral chip); for a
 * few people at once, `AvatarGroup`.
 *
 * A hairline ring keeps a pale photo from melting into a white card. The dot
 * is a mark: green online, amber busy, grey offline (away is not an error).
 */

import Image from "next/image";
import React from "react";

export type AvatarSize = "xsmall" | "small" | "medium" | "large" | "xlarge" | "xxlarge";

interface AvatarProps {
  src: string;
  /** Who it is: the person's name, never "avatar". */
  alt?: string;
  size?: AvatarSize;
  status?: "online" | "offline" | "busy" | "none";
  className?: string;
}

export const AVATAR_SIZE: Record<AvatarSize, string> = {
  xsmall: "size-6",
  small: "size-8",
  medium: "size-10",
  large: "size-12",
  xlarge: "size-14",
  xxlarge: "size-16",
};

const AVATAR_PX: Record<AvatarSize, number> = { xsmall: 24, small: 32, medium: 40, large: 48, xlarge: 56, xxlarge: 64 };

const statusSizeClasses: Record<AvatarSize, string> = {
  xsmall: "size-2",
  small: "size-2.5",
  medium: "size-2.5",
  large: "size-3",
  xlarge: "size-3.5",
  xxlarge: "size-4",
};

const statusColorClasses = {
  online: "bg-success-500",
  offline: "bg-gray-400 dark:bg-gray-500",
  busy: "bg-warning-500",
};

const STATUS_WORD = { online: "online", offline: "offline", busy: "busy" };

const Avatar: React.FC<AvatarProps> = ({ src, alt = "User avatar", size = "medium", status = "none", className = "" }) => {
  return (
    <span className={`relative inline-flex shrink-0 ${AVATAR_SIZE[size]} ${className}`}>
      <Image
        width={AVATAR_PX[size]}
        height={AVATAR_PX[size]}
        sizes={`${AVATAR_PX[size]}px`}
        src={src}
        alt={status !== "none" ? `${alt}, ${STATUS_WORD[status]}` : alt}
        className="size-full rounded-full object-cover ring-1 ring-black/5 dark:ring-white/10"
      />
      {status !== "none" && (
        <span
          aria-hidden="true"
          className={`absolute bottom-0 right-0 rounded-full ring-2 ring-white dark:ring-gray-900 ${statusSizeClasses[size]} ${statusColorClasses[status]}`}
        />
      )}
    </span>
  );
};

export default Avatar;
