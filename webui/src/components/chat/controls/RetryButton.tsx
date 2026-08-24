// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

interface RetryButtonProps {
  onClick: () => void;
}

/**
 * Button to retry from last user message
 * @param {RetryButtonProps} root0 - Component props
 * @param {() => void} root0.onClick - Click handler callback
 * @returns {JSX.Element} - React component
 */
export function RetryButton({ onClick }: RetryButtonProps) {
  return (
    <button
      onClick={onClick}
      className="flex size-7 items-center justify-center rounded text-sm text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
      title="Retry from your last message"
      aria-label="Retry from your last message"
    >
      ↻
    </button>
  );
}
