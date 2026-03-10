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
      className="text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 text-sm px-1 py-1 rounded hover:bg-stone-200 dark:hover:bg-stone-700"
      title="Retry from your last message"
    >
      ↻
    </button>
  );
}
