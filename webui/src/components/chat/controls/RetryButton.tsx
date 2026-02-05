// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

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
      className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-sm px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer"
      title="Retry from your last message"
    >
      ↻
    </button>
  );
}
