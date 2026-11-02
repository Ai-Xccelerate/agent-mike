"use client";

import React, { useId, useRef, useState } from "react";

import { Floating } from "@/components/ui/floating/Floating";

type Placement = "top" | "bottom" | "left" | "right";

interface TooltipProps {
  content: React.ReactNode;
  placement?: Placement;
  children: React.ReactNode;
}

/**
 * A short label on hover or focus. It floats over everything (`layer="tooltip"`)
 * against what it describes, so no card, scrolling panel or dialog can cover
 * it or cut it off; it is shown while the pointer or the focus is inside, and
 * Escape hides it (WCAG 1.4.13: content on hover is dismissable).
 */
const Tooltip: React.FC<TooltipProps> = ({
  content,
  placement = "top",
  children,
}) => {
  const id = useId();
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const shown = (hover || focus) && !dismissed;
  // The control it describes points at it, so a screen reader says the tip
  // after the control's name.
  const trigger = React.isValidElement<{ "aria-describedby"?: string }>(children)
    ? React.cloneElement(children, { "aria-describedby": id })
    : children;

  return (
    // A span, so a tooltip can sit inside a sentence (`<p>`) and stay valid HTML.
    <span
      ref={anchor}
      className="relative inline-flex"
      onMouseEnter={() => {
        setHover(true);
        setDismissed(false);
      }}
      onMouseLeave={() => setHover(false)}
      onFocus={() => {
        setFocus(true);
        setDismissed(false);
      }}
      onBlur={() => setFocus(false)}
      onKeyDown={(event) => {
        if (event.key === "Escape" && shown) {
          event.preventDefault();
          event.stopPropagation();
          setDismissed(true);
        }
      }}
    >
      {trigger}
      <Floating open anchor={anchor} side={placement} align="center" offset={8} layer="tooltip">
        <span
          role="tooltip"
          id={id}
          className={`max-w-xs rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 glass-popover transition-opacity duration-150 ease-out dark:border-white/[0.08] dark:text-gray-200 ${
            shown ? "visible opacity-100" : "invisible opacity-0"
          }`}
        >
          {content}
        </span>
      </Floating>
    </span>
  );
};

export default Tooltip;
