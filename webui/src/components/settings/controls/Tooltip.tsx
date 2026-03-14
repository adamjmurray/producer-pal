// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useRef, useState } from "preact/hooks";

interface TooltipProps {
  text: string;
}

interface Position {
  top: number;
  left: number;
}

/**
 * Info icon with tooltip popup. Shows on hover (desktop) and tap-to-toggle (mobile).
 * Multi-line text (separated by \n) renders as separate paragraphs.
 * Uses fixed positioning so the tooltip floats above all layout content.
 * @param props - Component props
 * @param props.text - Tooltip content, may contain \n for line breaks
 * @returns Tooltip component
 */
export function Tooltip({ text }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isPinned) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsPinned(false);
        setIsVisible(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isPinned]);

  useEffect(() => {
    if (!isVisible || !buttonRef.current) return;

    const rect = buttonRef.current.getBoundingClientRect();

    setPosition({ top: rect.bottom + 6, left: rect.left });
  }, [isVisible]);

  useEffect(() => {
    if (!position || !tooltipRef.current) return;

    const rect = tooltipRef.current.getBoundingClientRect();

    if (rect.right > window.innerWidth - 8) {
      setPosition((prev) =>
        prev
          ? { ...prev, left: Math.max(8, window.innerWidth - rect.width - 8) }
          : prev,
      );
    }
  }, [position]);

  const handleClick = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();

    const next = !isPinned;

    setIsPinned(next);
    setIsVisible(next);
  };

  const handleMouseEnter = () => {
    if (!isPinned) setIsVisible(true);
  };

  const handleMouseLeave = () => {
    if (!isPinned) setIsVisible(false);
  };

  const normalizedText = text.replaceAll("\n", " ").replaceAll(/\s{2,}/g, " ");

  return (
    <div ref={containerRef} className="relative inline-flex">
      <button
        ref={buttonRef}
        type="button"
        className="inline-flex items-center justify-center w-4 h-4 text-[10px] leading-none rounded-full border border-zinc-400 dark:border-zinc-500 text-zinc-500 dark:text-zinc-400 hover:border-blue-500 hover:text-blue-500 dark:hover:border-blue-400 dark:hover:text-blue-400 "
        aria-label="Tool description"
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        i
      </button>
      {isVisible && position && (
        <div
          ref={tooltipRef}
          role="tooltip"
          style={{ top: position.top, left: position.left }}
          className="fixed px-2.5 py-1.5 text-xs bg-zinc-800 dark:bg-zinc-700 text-white rounded border border-zinc-600 dark:border-zinc-500 shadow-md z-50 max-w-80 max-h-24 overflow-y-auto whitespace-normal wrap-break-word tooltip-fade-in"
        >
          {normalizedText}
        </div>
      )}
    </div>
  );
}
