// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useState } from "preact/hooks";

interface RateLimitRetryProps {
  until: number;
  onRetry: () => void;
}

/**
 * Countdown until an OpenAI rate-limit window expires. The session auto-retries
 * once it elapses (see useVoiceSession), so this is primarily a status display;
 * the button is a manual fallback that becomes enabled when the countdown
 * reaches zero (e.g. if an auto-retry itself gets re-limited).
 *
 * @param props - component props
 * @param props.until - Epoch ms when the rate limit clears
 * @param props.onRetry - Callback to nudge the model to generate the next response
 * @returns Countdown UI
 */
export function RateLimitRetry({ until, onRetry }: RateLimitRetryProps) {
  const [remainingMs, setRemainingMs] = useState(() =>
    Math.max(0, until - Date.now()),
  );

  useEffect(() => {
    setRemainingMs(Math.max(0, until - Date.now()));
    const id = setInterval(() => {
      const next = Math.max(0, until - Date.now());

      setRemainingMs(next);
      if (next === 0) clearInterval(id);
    }, 250);

    return () => clearInterval(id);
  }, [until]);

  const ready = remainingMs === 0;
  const seconds = Math.ceil(remainingMs / 1000);

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-zinc-600 dark:text-zinc-400">
        {ready ? "Retrying…" : `Auto-retrying in ${seconds}s…`}
      </span>
      <button
        type="button"
        onClick={onRetry}
        disabled={!ready}
        className="text-sm px-3 py-1 rounded border border-red-400 dark:border-red-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-red-100 dark:hover:bg-red-900/40"
      >
        Retry now
      </button>
    </div>
  );
}
