// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { EditIcon } from "#webui/components/chat/controls/header/HeaderIcons";

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
      className="justify-self-start text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 size-7 flex items-center justify-center rounded hover:bg-zinc-200 dark:hover:bg-zinc-700"
      title="Edit message"
      aria-label="Edit message"
    >
      <EditIcon />
    </button>
  );
}
