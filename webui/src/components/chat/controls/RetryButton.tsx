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
      className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 text-sm size-7 flex items-center justify-center rounded hover:bg-zinc-200 dark:hover:bg-zinc-700"
      title="Retry from your last message"
    >
      ↻
    </button>
  );
}
