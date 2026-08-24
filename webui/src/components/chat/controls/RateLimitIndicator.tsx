// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useState } from "preact/hooks";

interface RateLimitIndicatorProps {
  retryAttempt: number;
  maxAttempts: number;
  retryDelayMs: number;
  onCancel?: () => void;
}

/**
 * Displays rate limit status with countdown timer.
 *
 * Framed as its own card rather than sitting flush on the chat surface: it
 * mounts below the scrolling message list, so without a break the list's last
 * row — often the thinking indicator's waveform, clipped by the scroll edge —
 * appears to run into this block and read as broken rendering rather than as
 * content scrolled under a panel. The amber tint matches the accents below.
 * @param {RateLimitIndicatorProps} props - Component props
 * @param {number} props.retryAttempt - Current retry attempt (0-indexed)
 * @param {number} props.maxAttempts - Maximum retry attempts allowed
 * @param {number} props.retryDelayMs - Delay before next retry in milliseconds
 * @param {() => void} [props.onCancel] - Optional callback to cancel retry
 * @returns {JSX.Element} Rate limit indicator component
 */
export function RateLimitIndicator({
  retryAttempt,
  maxAttempts,
  retryDelayMs,
  onCancel,
}: RateLimitIndicatorProps) {
  const [remainingMs, setRemainingMs] = useState(retryDelayMs);

  useEffect(() => {
    setRemainingMs(retryDelayMs);

    const interval = setInterval(() => {
      setRemainingMs((prev) => Math.max(0, prev - 100));
    }, 100);

    return () => clearInterval(interval);
  }, [retryDelayMs, retryAttempt]);

  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const progress = 1 - remainingMs / retryDelayMs;

  return (
    <div className="mx-4 my-3 flex flex-col items-center rounded-lg border border-amber-300 bg-amber-50 px-6 py-4 dark:border-amber-500/40 dark:bg-amber-400/[0.07]">
      <div className="mb-2 flex items-center gap-3 text-amber-600 dark:text-amber-400">
        <RetryIcon />
        <span className="font-medium">Rate limit reached</span>
      </div>

      <div className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
        Retry attempt {retryAttempt + 1} of {maxAttempts}
      </div>

      <div className="mb-3 w-48">
        <div className="h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
          <div
            className="h-full bg-amber-500 transition-all duration-100 ease-linear dark:bg-amber-400"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>

      <div className="mb-3 font-mono text-lg text-zinc-700 dark:text-zinc-300">
        Retrying in {remainingSeconds}s
      </div>

      {onCancel && (
        <button
          onClick={onCancel}
          className="rounded px-3 py-1 text-sm text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
        >
          Cancel
        </button>
      )}
    </div>
  );
}

/**
 * Retry icon SVG
 * @returns {JSX.Element} SVG retry icon
 */
function RetryIcon() {
  return (
    <svg
      className="h-5 w-5 animate-spin"
      style={{ animationDuration: "2s" }}
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
        d="M4 12a8 8 0 018-8V2.5M4 12a8 8 0 008 8v1.5M12 4.5l2-2-2-2M12 21.5l-2 2 2 2"
      />
    </svg>
  );
}
