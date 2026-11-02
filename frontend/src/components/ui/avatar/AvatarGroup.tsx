/**
 * A few people as one overlapping row (LIB-AVATARGROUP): who is on a deal,
 * who was in a meeting. The first `max` drawn, the rest counted ("+3"); each
 * a photo or, without one, initials. A white ring parts them on any ground.
 *
 * Named once for a screen reader -- "Dana Ruiz, Marcus Lee and 3 others" --
 * rather than face by face.
 */

import Image from "next/image";
import React from "react";

export interface GroupPerson {
  name: string;
  /** A photo; initials are drawn without one. */
  src?: string;
}

type GroupSize = "xsmall" | "small" | "medium";

const BOX: Record<GroupSize, string> = {
  xsmall: "size-6 text-[10px]",
  small: "size-8 text-[11px]",
  medium: "size-10 text-theme-xs",
};
const PX: Record<GroupSize, number> = { xsmall: 24, small: 32, medium: 40 };
const OVERLAP: Record<GroupSize, string> = { xsmall: "-space-x-1.5", small: "-space-x-2", medium: "-space-x-2.5" };

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function namesOf(people: GroupPerson[], shown: number): string {
  const named = people.slice(0, shown).map((person) => person.name);
  const rest = people.length - shown;
  if (rest > 0) return `${named.join(", ")} and ${rest} ${rest === 1 ? "other" : "others"}`;
  if (named.length <= 1) return named.join("");
  return `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
}

export default function AvatarGroup({
  people,
  max = 4,
  size = "small",
  className = "",
}: {
  people: GroupPerson[];
  max?: number;
  size?: GroupSize;
  className?: string;
}) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  const ring = "rounded-full ring-2 ring-white dark:ring-gray-900";
  return (
    <span role="img" aria-label={namesOf(people, shown.length)} className={`inline-flex shrink-0 items-center ${OVERLAP[size]} ${className}`}>
      {shown.map((person, index) =>
        person.src ? (
          <Image
            key={`${person.name}-${index}`}
            src={person.src}
            alt=""
            width={PX[size]}
            height={PX[size]}
            sizes={`${PX[size]}px`}
            className={`${BOX[size]} ${ring} object-cover`}
          />
        ) : (
          <span
            key={`${person.name}-${index}`}
            aria-hidden="true"
            className={`flex items-center justify-center bg-gray-100 font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-200 ${BOX[size]} ${ring}`}
          >
            {initials(person.name)}
          </span>
        ),
      )}
      {rest > 0 ? (
        <span
          aria-hidden="true"
          className={`flex items-center justify-center bg-gray-50 font-semibold tabular-nums text-gray-600 dark:bg-gray-800/70 dark:text-gray-300 ${BOX[size]} ${ring}`}
        >
          +{rest}
        </span>
      ) : null}
    </span>
  );
}
