// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

interface EditButtonProps {
  onClick: () => void;
}

/**
 * Button to edit a user message
 * @param {EditButtonProps} root0 - Component props
 * @param {() => void} root0.onClick - Click handler callback
 * @returns {JSX.Element} - React component
 */
export function EditButton({ onClick }: EditButtonProps) {
  return (
    <button
      onClick={onClick}
      className="justify-self-start text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-sm px-1 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
      title="Edit message"
    >
      ✎
    </button>
  );
}
