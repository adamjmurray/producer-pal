// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useRef, useState } from "preact/hooks";

interface TooltipProps {
  text: string;
}

/**
 * Info icon with tooltip popup. Shows on hover (desktop) and tap-to-toggle (mobile).
 * Multi-line text (separated by \n) renders as separate paragraphs.
 * @param props - Component props
 * @param props.text - Tooltip content, may contain \n for line breaks
 * @returns Tooltip component
 */
export function Tooltip({ text }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  const paragraphs = text.split("\n").filter(Boolean);

  return (
    <div ref={containerRef} className="relative inline-flex">
      <button
        type="button"
        className="inline-flex items-center justify-center w-4 h-4 text-[10px] leading-none rounded-full border border-gray-400 dark:border-gray-500 text-gray-500 dark:text-gray-400 hover:border-blue-500 hover:text-blue-500 dark:hover:border-blue-400 dark:hover:text-blue-400 cursor-help"
        aria-label="Tool description"
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        i
      </button>
      {isVisible && (
        <div className="absolute bottom-full left-0 mb-1 px-2.5 py-1.5 text-xs bg-gray-800 dark:bg-gray-700 text-white rounded shadow-lg z-10 w-48">
          {paragraphs.map((line, idx) => (
            <p key={idx} className={idx > 0 ? "mt-1" : undefined}>
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
