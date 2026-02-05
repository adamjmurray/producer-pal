// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useState } from "preact/hooks";

interface RateLimitIndicatorProps {
  retryAttempt: number;
  maxAttempts: number;
  retryDelayMs: number;
  onCancel?: () => void;
}

/**
 * Displays rate limit status with countdown timer
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
    <div className="flex flex-col items-center py-4 px-6">
      <div className="flex items-center gap-3 text-amber-600 dark:text-amber-400 mb-2">
        <RetryIcon />
        <span className="font-medium">Rate limit reached</span>
      </div>

      <div className="text-sm text-gray-600 dark:text-gray-400 mb-3">
        Retry attempt {retryAttempt + 1} of {maxAttempts}
      </div>

      <div className="w-48 mb-3">
        <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-500 dark:bg-amber-400 transition-all duration-100 ease-linear"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>

      <div className="text-lg font-mono text-gray-700 dark:text-gray-300 mb-3">
        Retrying in {remainingSeconds}s
      </div>

      {onCancel && (
        <button
          onClick={onCancel}
          className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-3 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer"
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
      className="w-5 h-5 animate-spin"
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
