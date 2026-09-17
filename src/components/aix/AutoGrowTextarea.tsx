"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { TextareaHTMLAttributes } from "react";

export interface AutoGrowTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Height floor, in text lines. Matches the old `rows` prop's intent. */
  minRows?: number;
  /** Height ceiling, in text lines — past this the field scrolls instead of growing. */
  maxRows?: number;
}

/**
 * A textarea that grows with its content instead of clipping it or leaving a
 * manual resize handle. Height is recalculated from `scrollHeight` on every
 * input and whenever `value` changes from outside (e.g. programmatic clear),
 * clamped between `minRows` and `maxRows`.
 */
const AutoGrowTextarea = forwardRef<HTMLTextAreaElement, AutoGrowTextareaProps>(function AutoGrowTextarea(
  { minRows = 1, maxRows, value, onInput, style, ...props },
  forwardedRef,
) {
  const innerRef = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(forwardedRef, () => innerRef.current as HTMLTextAreaElement);

  const resize = () => {
    const el = innerRef.current;
    if (!el) return;
    const computed = getComputedStyle(el);
    const lineHeight = parseFloat(computed.lineHeight) || 20;
    const borderY = parseFloat(computed.borderTopWidth) + parseFloat(computed.borderBottomWidth);
    const paddingY = parseFloat(computed.paddingTop) + parseFloat(computed.paddingBottom);
    const minHeight = lineHeight * minRows + paddingY + borderY;
    const maxHeight = maxRows ? lineHeight * maxRows + paddingY + borderY : Infinity;

    el.style.height = "auto";
    const next = Math.min(Math.max(el.scrollHeight, minHeight), maxHeight);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  };

  useEffect(() => {
    resize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <textarea
      ref={innerRef}
      value={value}
      onInput={(event) => {
        resize();
        onInput?.(event);
      }}
      style={{ ...style, overflow: "hidden" }}
      {...props}
    />
  );
});

export default AutoGrowTextarea;
